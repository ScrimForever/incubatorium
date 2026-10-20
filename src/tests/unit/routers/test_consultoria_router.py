"""Agenda de consultoria: abertura, edição, cancelamento e reservas."""

from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import select

from domain.models.consultoria import ConsultoriaHorario, ConsultoriaJanela
from routers.consultoria import router
from services.consultoria.consultoria_service import ConsultoriaService
from shared.datas import FUSO


def hoje() -> date:
    return datetime.now(FUSO).date()


def dia(n: int) -> str:
    return (hoje() + timedelta(days=n + 2)).isoformat()


AGENDA = {
    "datas": [dia(1), dia(2)],
    "blocos": [
        {"hora_inicio": "11:00", "hora_fim": "13:00", "duracao_minutos": 60},
        {"hora_inicio": "15:00", "hora_fim": "19:00", "duracao_minutos": 30},
    ],
}


@pytest.fixture
def enviados(monkeypatch):
    avisos = []

    async def _enviar(self, lista):
        avisos.extend(lista)

    monkeypatch.setattr(ConsultoriaService, "enviar_avisos", _enviar)
    return avisos


@pytest.fixture
async def consultor(criar_usuario):
    return await criar_usuario("consultor", "cons1@example.com")


@pytest.fixture
async def consultor_api(cliente_api, consultor):
    return await cliente_api([router], consultor)


async def abrir(cliente, corpo=AGENDA):
    resposta = await cliente.post("/consultorias/agenda", json=corpo)
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


class TestAbrirAgenda:
    @pytest.mark.asyncio
    async def test_blocos_livres_geram_janelas_e_horarios(
        self, consultor_api, enviados
    ):
        janelas = await abrir(consultor_api)

        assert len(janelas) == 4  # 2 dias x 2 blocos
        manha, tarde = janelas[0], janelas[1]
        assert (manha["hora_inicio"], manha["hora_fim"]) == ("11:00:00", "13:00:00")
        assert len(manha["horarios"]) == 2  # 60 min
        assert len(tarde["horarios"]) == 8  # 30 min
        # 13h-15h fica sem horários
        assert tarde["horarios"][0]["inicio"].startswith(
            f"{dia(1)}T18:00:00"
        )  # 15h em São Paulo = 18h UTC

    @pytest.mark.asyncio
    async def test_avisa_so_incubados_ativos(
        self, consultor_api, criar_usuario, async_db, enviados
    ):
        from domain.models.enums import SituacaoIncubacao

        ativo = await criar_usuario("incubado", "ativo@example.com")
        ativo.situacao_incubacao = SituacaoIncubacao.ativo
        desistente = await criar_usuario("incubado", "saiu@example.com")
        desistente.situacao_incubacao = SituacaoIncubacao.desistente
        await async_db.commit()

        await abrir(consultor_api)

        assert [a.email for a in enviados] == ["ativo@example.com"]
        assert "cons1@example.com" in enviados[0].detalhe

    @pytest.mark.asyncio
    async def test_sobreposicao_com_agenda_existente_da_409(
        self, consultor_api, enviados
    ):
        await abrir(consultor_api)
        corpo = {
            "datas": [dia(1)],
            "blocos": [
                {"hora_inicio": "12:00", "hora_fim": "14:00", "duracao_minutos": 60}
            ],
        }

        resposta = await consultor_api.post("/consultorias/agenda", json=corpo)

        assert resposta.status_code == 409

    @pytest.mark.asyncio
    async def test_janela_encostada_e_valida(self, consultor_api, enviados):
        await abrir(consultor_api)
        corpo = {
            "datas": [dia(1)],
            "blocos": [
                {"hora_inicio": "13:00", "hora_fim": "15:00", "duracao_minutos": 60}
            ],
        }

        resposta = await consultor_api.post("/consultorias/agenda", json=corpo)

        assert resposta.status_code == 201

    @pytest.mark.asyncio
    async def test_dois_consultores_no_mesmo_horario(
        self, cliente_api, criar_usuario, consultor_api, enviados
    ):
        await abrir(consultor_api)
        outro = await criar_usuario("consultor", "cons2@example.com")
        cliente2 = await cliente_api([router], outro)

        resposta = await cliente2.post("/consultorias/agenda", json=AGENDA)

        assert resposta.status_code == 201

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "corpo",
        [
            {"datas": [], "blocos": AGENDA["blocos"]},
            {"datas": [dia(1)], "blocos": []},
            {"datas": [dia(1), dia(1)], "blocos": AGENDA["blocos"]},
            {
                "datas": [dia(1)],
                "blocos": [
                    {"hora_inicio": "13:00", "hora_fim": "11:00", "duracao_minutos": 30}
                ],
            },
            {
                "datas": [dia(1)],
                "blocos": [
                    {"hora_inicio": "11:00", "hora_fim": "11:30", "duracao_minutos": 60}
                ],
            },
            {
                "datas": [dia(1)],
                "blocos": [
                    {
                        "hora_inicio": "11:00",
                        "hora_fim": "13:00",
                        "duracao_minutos": 60,
                    },
                    {
                        "hora_inicio": "12:00",
                        "hora_fim": "14:00",
                        "duracao_minutos": 60,
                    },
                ],
            },
        ],
    )
    async def test_entrada_invalida_da_422(self, consultor_api, enviados, corpo):
        resposta = await consultor_api.post("/consultorias/agenda", json=corpo)

        assert resposta.status_code == 422

    @pytest.mark.asyncio
    async def test_data_passada_da_422(self, consultor_api, enviados):
        ontem = (hoje() - timedelta(days=2)).isoformat()
        corpo = {**AGENDA, "datas": [ontem]}

        resposta = await consultor_api.post("/consultorias/agenda", json=corpo)

        assert resposta.status_code == 422


class TestPerfis:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("perfil", ["incubado", "colaborador"])
    async def test_so_consultor_abre_agenda(
        self, perfil, cliente_api, criar_usuario, enviados
    ):
        cliente = await cliente_api([router], await criar_usuario(perfil))

        resposta = await cliente.post("/consultorias/agenda", json=AGENDA)

        assert resposta.status_code == 403

    @pytest.mark.asyncio
    async def test_consultor_nao_reserva_mesmo_com_is_incubado(
        self, cliente_api, criar_usuario, enviados
    ):
        hibrido = await criar_usuario("consultor")
        hibrido.is_incubado = True
        cliente = await cliente_api([router], hibrido)

        resposta = await cliente.get("/consultorias/horarios")

        assert resposta.status_code == 403

    @pytest.mark.asyncio
    async def test_consultor_com_is_incubado_nao_edita_proprio_questionario(
        self, cliente_api, criar_usuario
    ):
        from routers.questionario import router as router_q

        hibrido = await criar_usuario("consultor")
        hibrido.is_incubado = True
        cliente = await cliente_api([router_q], hibrido)

        resposta = await cliente.put(
            "/questionario", json={"status_questionario": "pendente"}
        )

        assert resposta.status_code == 403


class TestEditarCancelar:
    @pytest.mark.asyncio
    async def test_editar_janela_regera_horarios_livres(self, consultor_api, enviados):
        janela = (await abrir(consultor_api))[0]

        resposta = await consultor_api.patch(
            f"/consultorias/janelas/{janela['id']}",
            json={"hora_fim": "14:00", "duracao_minutos": 30},
        )

        assert resposta.status_code == 200
        assert len(resposta.json()["horarios"]) == 6  # 11:00-14:00 de 30 em 30

    @pytest.mark.asyncio
    async def test_editar_janela_mantem_reservado_e_recusa_deixa_lo_fora(
        self, consultor_api, cliente_api, criar_usuario, enviados
    ):
        janela = (await abrir(consultor_api))[0]
        ana = await criar_usuario("incubado", "ana@example.com")
        cliente_ana = await cliente_api([router], ana)
        segundo = janela["horarios"][1]  # 12:00-13:00
        assert (
            await cliente_ana.post(f"/consultorias/horarios/{segundo['id']}/reservar")
        ).status_code == 200

        # encolher para 11-12h deixaria a reserva das 12h fora da faixa
        fora = await consultor_api.patch(
            f"/consultorias/janelas/{janela['id']}", json={"hora_fim": "12:00"}
        )
        # esticar até 14h mantém a reserva e regera só o que está livre
        dentro = await consultor_api.patch(
            f"/consultorias/janelas/{janela['id']}", json={"hora_fim": "14:00"}
        )

        assert fora.status_code == 409
        assert dentro.status_code == 200
        horarios = dentro.json()["horarios"]
        assert [h["incubado_email"] for h in horarios] == [
            None,
            "ana@example.com",
            None,
        ]

    @pytest.mark.asyncio
    async def test_editar_janela_para_cima_de_outra_da_409(
        self, consultor_api, enviados
    ):
        manha = (await abrir(consultor_api))[0]

        resposta = await consultor_api.patch(
            f"/consultorias/janelas/{manha['id']}", json={"hora_fim": "16:00"}
        )

        assert resposta.status_code == 409

    @pytest.mark.asyncio
    async def test_cancelar_um_dia_so_afeta_aquele_dia_e_avisa_reservados(
        self, consultor_api, cliente_api, criar_usuario, async_db, enviados
    ):
        janelas = await abrir(consultor_api)
        ana = await criar_usuario("incubado", "ana@example.com")
        cliente_ana = await cliente_api([router], ana)
        await cliente_ana.post(
            f"/consultorias/horarios/{janelas[0]['horarios'][0]['id']}/reservar"
        )

        resposta = await consultor_api.post(
            "/consultorias/janelas/cancelar", json={"datas": [dia(1)]}
        )

        assert resposta.json() == {"janelas_canceladas": 2, "reservas_canceladas": 1}
        restantes = (await async_db.execute(select(ConsultoriaJanela))).scalars().all()
        assert {j.data.isoformat() for j in restantes} == {dia(2)}
        assert [a.email for a in enviados] == ["ana@example.com"]
        assert "cancelada" in enviados[0].titulo

    @pytest.mark.asyncio
    async def test_cancelar_varios_dias(self, consultor_api, enviados):
        await abrir(consultor_api)

        resposta = await consultor_api.post(
            "/consultorias/janelas/cancelar", json={"datas": [dia(1), dia(2)]}
        )

        assert resposta.json()["janelas_canceladas"] == 4
        assert (await consultor_api.get("/consultorias/agenda/minha")).json() == []

    @pytest.mark.asyncio
    async def test_cancelar_dia_sem_janela_da_404(self, consultor_api, enviados):
        resposta = await consultor_api.post(
            "/consultorias/janelas/cancelar", json={"datas": [dia(9)]}
        )

        assert resposta.status_code == 404

    @pytest.mark.asyncio
    async def test_cancelar_janela_unica(self, consultor_api, async_db, enviados):
        janela = (await abrir(consultor_api))[0]

        resposta = await consultor_api.delete(f"/consultorias/janelas/{janela['id']}")

        assert resposta.status_code == 200
        assert (
            len((await async_db.execute(select(ConsultoriaJanela))).scalars().all())
            == 3
        )
        horarios = (await async_db.execute(select(ConsultoriaHorario))).scalars().all()
        assert all(h.janela_id != janela["id"] for h in horarios)

    @pytest.mark.asyncio
    async def test_consultor_nao_mexe_na_agenda_de_outro(
        self, cliente_api, criar_usuario, consultor_api, enviados
    ):
        janela = (await abrir(consultor_api))[0]
        intruso = await cliente_api(
            [router], await criar_usuario("consultor", "x@example.com")
        )

        assert (
            await intruso.delete(f"/consultorias/janelas/{janela['id']}")
        ).status_code == 404
        assert (
            await intruso.patch(
                f"/consultorias/janelas/{janela['id']}", json={"hora_fim": "12:00"}
            )
        ).status_code == 404
        h = janela["horarios"][0]["id"]
        assert (await intruso.delete(f"/consultorias/horarios/{h}")).status_code == 404

    @pytest.mark.asyncio
    async def test_editar_horario_livre_dentro_da_janela(self, consultor_api, enviados):
        janela = (await abrir(consultor_api))[0]
        h = janela["horarios"][0]["id"]

        ok = await consultor_api.patch(
            f"/consultorias/horarios/{h}",
            json={"hora_inicio": "11:00", "hora_fim": "11:30"},
        )
        fora = await consultor_api.patch(
            f"/consultorias/horarios/{h}",
            json={"hora_inicio": "10:00", "hora_fim": "11:00"},
        )
        choca = await consultor_api.patch(
            f"/consultorias/horarios/{h}",
            json={"hora_inicio": "11:30", "hora_fim": "12:30"},
        )

        assert ok.status_code == 200
        assert fora.status_code == 422
        assert choca.status_code == 409

    @pytest.mark.asyncio
    async def test_cancelar_horario_reservado_avisa_o_incubado(
        self, consultor_api, cliente_api, criar_usuario, enviados
    ):
        janela = (await abrir(consultor_api))[0]
        h = janela["horarios"][0]["id"]
        ana = await cliente_api(
            [router], await criar_usuario("incubado", "ana@example.com")
        )
        await ana.post(f"/consultorias/horarios/{h}/reservar")

        resposta = await consultor_api.delete(f"/consultorias/horarios/{h}")

        assert resposta.status_code == 204
        assert [a.email for a in enviados] == ["ana@example.com"]


class TestReservas:
    @pytest.fixture
    async def horarios(self, consultor_api, enviados):
        janelas = await abrir(consultor_api)
        return janelas[0]["horarios"]  # 11-12h e 12-13h do primeiro dia

    @pytest.mark.asyncio
    async def test_reserva_e_lista(self, cliente_api, criar_usuario, horarios):
        ana = await cliente_api(
            [router], await criar_usuario("incubado", "ana@example.com")
        )

        resposta = await ana.post(
            f"/consultorias/horarios/{horarios[0]['id']}/reservar"
        )
        livres = (await ana.get("/consultorias/horarios")).json()
        minhas = (await ana.get("/consultorias/minhas")).json()

        assert resposta.status_code == 200
        assert resposta.json()["incubado_email"] == "ana@example.com"
        assert horarios[0]["id"] not in {h["id"] for h in livres}
        assert [h["id"] for h in minhas] == [horarios[0]["id"]]

    @pytest.mark.asyncio
    async def test_outro_incubado_nao_pega_o_mesmo_horario(
        self, cliente_api, criar_usuario, horarios
    ):
        ana = await cliente_api(
            [router], await criar_usuario("incubado", "ana@example.com")
        )
        beto = await cliente_api(
            [router], await criar_usuario("incubado", "beto@example.com")
        )
        url = f"/consultorias/horarios/{horarios[0]['id']}/reservar"

        assert (await ana.post(url)).status_code == 200
        assert (await beto.post(url)).status_code == 409

    @pytest.mark.asyncio
    async def test_incubado_nao_marca_dois_consultores_no_mesmo_horario(
        self, cliente_api, criar_usuario, horarios, enviados
    ):
        outro = await cliente_api(
            [router], await criar_usuario("consultor", "cons2@example.com")
        )
        horario_cons2 = (await abrir(outro))[0]["horarios"][0]  # mesmo 11-12h
        ana = await cliente_api(
            [router], await criar_usuario("incubado", "ana@example.com")
        )

        primeira = await ana.post(
            f"/consultorias/horarios/{horarios[0]['id']}/reservar"
        )
        segunda = await ana.post(
            f"/consultorias/horarios/{horario_cons2['id']}/reservar"
        )
        livres = (await ana.get("/consultorias/horarios")).json()

        assert primeira.status_code == 200
        assert segunda.status_code == 409
        assert horario_cons2["id"] in {h["id"] for h in livres}  # continuou livre

    @pytest.mark.asyncio
    async def test_cancelar_reserva_libera_para_outro(
        self, cliente_api, criar_usuario, horarios
    ):
        ana = await cliente_api(
            [router], await criar_usuario("incubado", "ana@example.com")
        )
        beto = await cliente_api(
            [router], await criar_usuario("incubado", "beto@example.com")
        )
        h = horarios[0]["id"]
        await ana.post(f"/consultorias/horarios/{h}/reservar")

        assert (
            await beto.delete(f"/consultorias/horarios/{h}/reserva")
        ).status_code == 404
        assert (
            await ana.delete(f"/consultorias/horarios/{h}/reserva")
        ).status_code == 204
        assert (
            await beto.post(f"/consultorias/horarios/{h}/reservar")
        ).status_code == 200

    @pytest.mark.asyncio
    async def test_horario_inexistente_da_404(self, cliente_api, criar_usuario):
        ana = await cliente_api(
            [router], await criar_usuario("incubado", "ana@example.com")
        )

        assert (
            await ana.post("/consultorias/horarios/9999/reservar")
        ).status_code == 404

    @pytest.mark.asyncio
    async def test_mover_horario_reservado_para_cima_de_outra_marcacao_do_incubado(
        self, cliente_api, criar_usuario, consultor_api, horarios, enviados
    ):
        outro = await cliente_api(
            [router], await criar_usuario("consultor", "cons2@example.com")
        )
        h2 = (await abrir(outro))[0]["horarios"][1]  # cons2, 12-13h
        ana = await cliente_api(
            [router], await criar_usuario("incubado", "ana@example.com")
        )
        await ana.post(
            f"/consultorias/horarios/{horarios[0]['id']}/reservar"
        )  # cons1 11-12h
        await ana.post(f"/consultorias/horarios/{h2['id']}/reservar")  # cons2 12-13h
        # cons1 tenta mover o horário da Ana para 12-13h, onde ela já está com cons2
        resposta = await consultor_api.patch(
            f"/consultorias/horarios/{horarios[0]['id']}",
            json={"hora_inicio": "12:00", "hora_fim": "13:00"},
        )

        assert resposta.status_code == 409
