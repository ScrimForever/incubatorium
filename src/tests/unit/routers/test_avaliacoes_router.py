import pytest

from domain.models.questionarios.questionario import Questionario, StatusEnum
from routers.avaliacoes.r_avaliacoes import router


@pytest.fixture(autouse=True)
def _sem_email(monkeypatch):
    async def _ok(*_, **__):
        return True

    monkeypatch.setattr(
        "services.email.setup.EmailSetup.enviar_email_nova_avaliacao", _ok
    )


async def _cenario(async_db, criar_usuario):
    incubado = await criar_usuario("incubado", "ana@example.com")
    consultor = await criar_usuario("consultor")
    async_db.add(
        Questionario(
            usuario_email=incubado.email,
            status_questionario=StatusEnum.aprovado,
            json_questionario={"2": {"business_canvas": "Canvas"}},
            criado_por=incubado.email,
        )
    )
    await async_db.commit()
    return incubado, consultor


CORPO = {"nota": 4, "parecer": "Bom canvas"}
ROTA = "/usuarios/ana@example.com/avaliacoes"


class TestAvaliar:
    @pytest.mark.asyncio
    async def test_consultor_avalia_e_o_incubado_le(
        self, async_db, criar_usuario, cliente_api
    ):
        incubado, consultor = await _cenario(async_db, criar_usuario)

        avaliada = await (await cliente_api([router], consultor)).put(
            f"{ROTA}/2", json=CORPO
        )
        lida = await (await cliente_api([router], incubado)).get(ROTA)

        assert avaliada.status_code == 200
        assert avaliada.json()["nota"] == 4
        assert avaliada.json()["avaliador"] == consultor.email
        assert [a["etapa_id"] for a in lida.json()] == [2]
        assert lida.json()[0]["parecer"] == "Bom canvas"

    @pytest.mark.asyncio
    async def test_colaborador_nao_avalia_e_recebe_403(
        self, async_db, criar_usuario, cliente_api
    ):
        await _cenario(async_db, criar_usuario)
        outro = await criar_usuario("colaborador")

        resposta = await (await cliente_api([router], outro)).put(
            f"{ROTA}/2", json=CORPO
        )

        assert resposta.status_code == 403

    @pytest.mark.asyncio
    @pytest.mark.parametrize("perfil", ["incubado", "colaborador", "admin"])
    async def test_incubado_e_equipe_nao_gravam_avaliacao(
        self, async_db, criar_usuario, cliente_api, perfil
    ):
        await _cenario(async_db, criar_usuario)
        usuario = await criar_usuario(perfil)

        resposta = await (await cliente_api([router], usuario)).put(
            f"{ROTA}/2", json=CORPO
        )

        assert resposta.status_code == 403

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "corpo",
        [
            {"nota": 6, "parecer": "x"},
            {"nota": -1, "parecer": "x"},
            {"nota": 0, "parecer": "x"},
            {"nota": 3, "parecer": "  "},
            {"nota": 3},
        ],
    )
    async def test_corpo_invalido_da_422(
        self, async_db, criar_usuario, cliente_api, corpo
    ):
        _, consultor = await _cenario(async_db, criar_usuario)

        resposta = await (await cliente_api([router], consultor)).put(
            f"{ROTA}/2", json=corpo
        )

        assert resposta.status_code == 422



class TestLeitura:
    @pytest.mark.asyncio
    async def test_colaborador_le_outro_incubado_nao(
        self, async_db, criar_usuario, cliente_api
    ):
        _, consultor = await _cenario(async_db, criar_usuario)
        colaborador = await criar_usuario("colaborador")
        intruso = await criar_usuario("incubado")
        await (await cliente_api([router], consultor)).put(f"{ROTA}/2", json=CORPO)

        da_equipe = await (await cliente_api([router], colaborador)).get(ROTA)
        do_intruso = await (await cliente_api([router], intruso)).get(ROTA)

        assert da_equipe.status_code == 200
        assert len(da_equipe.json()) == 1
        assert do_intruso.status_code == 403
