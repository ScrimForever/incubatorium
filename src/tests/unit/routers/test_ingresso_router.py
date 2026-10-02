import pytest

from domain.models.questionarios.questionario import Questionario, StatusEnum
from routers.ingresso.r_ingresso import router

PREENCHIDO = {"2": {"business_canvas": "Canvas"}}


async def _semear(async_db, email, status, json=None):
    async_db.add(
        Questionario(
            usuario_email=email,
            status_questionario=status,
            json_questionario=PREENCHIDO if json is None else json,
            criado_por=email,
        )
    )
    await async_db.commit()


@pytest.fixture(autouse=True)
def _sem_email(monkeypatch):
    async def _ok(*_, **__):
        return True

    monkeypatch.setattr(
        "services.email.setup.EmailSetup.enviar_email_decisao_ingresso", _ok
    )


class TestFluxoDoCandidato:
    @pytest.mark.asyncio
    async def test_enviar_reiniciar_e_historico(
        self, async_db, criar_usuario, cliente_api, monkeypatch
    ):
        monkeypatch.setattr(
            "services.ingresso.ingresso_service.arquivar_pasta", lambda *_: True
        )
        candidato = await criar_usuario("incubado", "ana@example.com")
        colaborador = await criar_usuario("colaborador")
        await _semear(async_db, candidato.email, StatusEnum.pendente)
        como_candidato = await cliente_api([router], candidato)
        como_colaborador = await cliente_api([router], colaborador)

        enviado = await como_candidato.post("/ingresso/enviar")
        assert enviado.status_code == 200
        assert enviado.json()["status_questionario"] == "aguardando_aprovacao"

        rejeitado = await como_colaborador.post(
            "/ingresso/ana@example.com/rejeitar", json={"motivo": "Faltou o canvas"}
        )
        assert rejeitado.status_code == 200
        assert rejeitado.json()["motivo_decisao"] == "Faltou o canvas"

        reiniciado = await como_candidato.post("/ingresso/reiniciar")
        assert reiniciado.status_code == 200
        assert reiniciado.json()["status_questionario"] == "pendente"

        historico = await como_candidato.get("/ingresso/ana@example.com/historico")
        assert historico.status_code == 200
        [item] = historico.json()
        assert item["chave"] == "ana@example.com_1"
        assert item["ordem"] == 1
        assert item["motivo_decisao"] == "Faltou o canvas"

        await como_candidato.post("/ingresso/enviar")
        aprovado = await como_colaborador.post("/ingresso/ana@example.com/aprovar")
        assert aprovado.status_code == 200
        assert aprovado.json()["status_questionario"] == "aprovado"

    @pytest.mark.asyncio
    async def test_reiniciar_sem_rejeicao_da_409(
        self, async_db, criar_usuario, cliente_api
    ):
        candidato = await criar_usuario("incubado")
        await _semear(async_db, candidato.email, StatusEnum.pendente)
        cliente = await cliente_api([router], candidato)

        resposta = await cliente.post("/ingresso/reiniciar")

        assert resposta.status_code == 409
        assert "mensagem" in resposta.json()

    @pytest.mark.asyncio
    async def test_enviar_sem_questionario_da_404(self, criar_usuario, cliente_api):
        candidato = await criar_usuario("incubado")
        cliente = await cliente_api([router], candidato)

        assert (await cliente.post("/ingresso/enviar")).status_code == 404


class TestPermissoes:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("perfil", ["incubado", "consultor", "admin"])
    @pytest.mark.parametrize(
        ("metodo", "rota"),
        [
            ("GET", "/ingresso"),
            ("POST", "/ingresso/ana@example.com/aprovar"),
            ("POST", "/ingresso/ana@example.com/rejeitar"),
        ],
    )
    async def test_so_colaborador_lista_e_decide(
        self, async_db, criar_usuario, cliente_api, perfil, metodo, rota
    ):
        candidato = await criar_usuario("incubado", "ana@example.com")
        await _semear(async_db, candidato.email, StatusEnum.aguardando_aprovacao)
        intruso = await criar_usuario(perfil)
        cliente = await cliente_api([router], intruso)

        corpo = {"motivo": "x"} if rota.endswith("rejeitar") else None
        resposta = await cliente.request(metodo, rota, json=corpo)

        assert resposta.status_code == 403
        questionario = await async_db.get(Questionario, "ana@example.com")
        assert questionario.status_questionario == StatusEnum.aguardando_aprovacao

    @pytest.mark.asyncio
    async def test_rejeitar_sem_motivo_da_422(
        self, async_db, criar_usuario, cliente_api
    ):
        candidato = await criar_usuario("incubado", "ana@example.com")
        colaborador = await criar_usuario("colaborador")
        await _semear(async_db, candidato.email, StatusEnum.aguardando_aprovacao)
        cliente = await cliente_api([router], colaborador)

        resposta = await cliente.post(
            "/ingresso/ana@example.com/rejeitar", json={"motivo": "   "}
        )

        assert resposta.status_code == 422

    @pytest.mark.asyncio
    async def test_decidir_duas_vezes_da_409(
        self, async_db, criar_usuario, cliente_api
    ):
        candidato = await criar_usuario("incubado", "ana@example.com")
        colaborador = await criar_usuario("colaborador")
        await _semear(async_db, candidato.email, StatusEnum.aguardando_aprovacao)
        cliente = await cliente_api([router], colaborador)

        assert (
            await cliente.post("/ingresso/ana@example.com/aprovar")
        ).status_code == 200
        assert (
            await cliente.post("/ingresso/ana@example.com/aprovar")
        ).status_code == 409

    @pytest.mark.asyncio
    async def test_listar_pedidos_filtra_por_status(
        self, async_db, criar_usuario, cliente_api
    ):
        ana = await criar_usuario("incubado", "ana@example.com")
        beto = await criar_usuario("incubado", "beto@example.com")
        colaborador = await criar_usuario("colaborador")
        await _semear(async_db, ana.email, StatusEnum.aguardando_aprovacao)
        await _semear(async_db, beto.email, StatusEnum.pendente)
        cliente = await cliente_api([router], colaborador)

        todos = await cliente.get("/ingresso")
        em_analise = await cliente.get("/ingresso?status=aguardando_aprovacao")

        assert {p["usuario_email"] for p in todos.json()} == {ana.email, beto.email}
        assert [p["usuario_email"] for p in em_analise.json()] == [ana.email]

    @pytest.mark.asyncio
    async def test_historico_so_do_dono_ou_colaborador(
        self, async_db, criar_usuario, cliente_api
    ):
        dono = await criar_usuario("incubado", "ana@example.com")
        outro = await criar_usuario("incubado")
        colaborador = await criar_usuario("colaborador")
        await _semear(async_db, "ana@example.com_1", StatusEnum.rejeitado)

        assert (
            await (await cliente_api([router], dono)).get(
                "/ingresso/ana@example.com/historico"
            )
        ).status_code == 200
        assert (
            await (await cliente_api([router], colaborador)).get(
                "/ingresso/ana@example.com/historico"
            )
        ).status_code == 200
        assert (
            await (await cliente_api([router], outro)).get(
                "/ingresso/ana@example.com/historico"
            )
        ).status_code == 403


class TestEtapas:
    @pytest.mark.asyncio
    async def test_lista_as_nove_etapas_em_ordem(self, criar_usuario, cliente_api):
        cliente = await cliente_api([router], await criar_usuario("incubado"))

        resposta = await cliente.get("/etapas")

        assert resposta.status_code == 200
        etapas = resposta.json()
        assert [e["id"] for e in etapas] == list(range(1, 10))
        assert [e["ordem"] for e in etapas] == list(range(1, 10))
        assert etapas[0]["titulo"] == "Setor de atuação"
        assert [e["id"] for e in etapas if not e["avaliavel"]] == [1]
