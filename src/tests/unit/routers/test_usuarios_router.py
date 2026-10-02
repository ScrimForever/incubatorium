from datetime import UTC, datetime

import pytest

from domain.models.enums import SituacaoIncubacao
from domain.models.questionarios.questionario import Questionario, StatusEnum
from routers.usuarios.r_usuarios import router


async def _plano(async_db, email):
    async_db.add(
        Questionario(
            usuario_email=email,
            status_questionario=StatusEnum.aprovado,
            json_questionario={"2": {"business_canvas": "Canvas"}},
            criado_por=email,
        )
    )
    await async_db.commit()


class TestPlano:
    @pytest.mark.asyncio
    async def test_dono_e_colaborador_leem_o_plano_vigente(
        self, async_db, criar_usuario, cliente_api
    ):
        dono = await criar_usuario("incubado", "ana@example.com")
        colaborador = await criar_usuario("colaborador")
        await _plano(async_db, dono.email)

        do_dono = await (await cliente_api([router], dono)).get(
            "/usuarios/ana@example.com/plano"
        )
        da_equipe = await (await cliente_api([router], colaborador)).get(
            "/usuarios/ana@example.com/plano"
        )

        assert do_dono.status_code == 200
        assert do_dono.json()["json_questionario"]["2"]["business_canvas"] == "Canvas"
        assert da_equipe.json() == do_dono.json()

    @pytest.mark.asyncio
    async def test_outro_incubado_recebe_403(
        self, async_db, criar_usuario, cliente_api
    ):
        dono = await criar_usuario("incubado", "ana@example.com")
        await _plano(async_db, dono.email)

        intruso = await criar_usuario("incubado")
        resposta = await (await cliente_api([router], intruso)).get(
            "/usuarios/ana@example.com/plano"
        )
        assert resposta.status_code == 403

    @pytest.mark.asyncio
    async def test_incubado_sem_questionario_da_404(self, criar_usuario, cliente_api):
        colaborador = await criar_usuario("colaborador")
        await criar_usuario("incubado", "ana@example.com")

        resposta = await (await cliente_api([router], colaborador)).get(
            "/usuarios/ana@example.com/plano"
        )

        assert resposta.status_code == 404


async def _incubado(async_db, criar_usuario, email, situacao=SituacaoIncubacao.ativo):
    usuario = await criar_usuario("incubado", email)
    async_db.add(
        Questionario(
            usuario_email=email,
            status_questionario=StatusEnum.aprovado,
            json_questionario={"2": {"business_canvas": "Canvas"}},
            criado_por=email,
        )
    )
    usuario.situacao_incubacao = situacao
    await async_db.commit()
    return usuario


class TestPainel:
    @pytest.mark.asyncio
    async def test_lista_incubados_com_situacao_e_ultima_avaliacao(
        self, async_db, criar_usuario, cliente_api
    ):
        ana = await _incubado(async_db, criar_usuario, "ana@example.com")
        await _incubado(
            async_db, criar_usuario, "beto@example.com", SituacaoIncubacao.concluido
        )
        candidato = await criar_usuario("incubado", "candidato@example.com")
        async_db.add(
            Questionario(
                usuario_email=candidato.email,
                status_questionario=StatusEnum.aguardando_aprovacao,
                json_questionario={},
                criado_por=candidato.email,
            )
        )
        quando = datetime(2026, 10, 1, 12, tzinfo=UTC)
        (await async_db.get(Questionario, ana.email)).ultima_avaliacao_em = quando
        await async_db.commit()
        colaborador = await criar_usuario("colaborador")

        resposta = await (await cliente_api([router], colaborador)).get(
            "/usuarios?perfil=incubado"
        )

        assert resposta.status_code == 200
        painel = {linha["email"]: linha for linha in resposta.json()}
        assert set(painel) == {"ana@example.com", "beto@example.com"}
        assert painel["ana@example.com"]["situacao"] == "ativo"
        assert painel["ana@example.com"]["status_questionario"] == "aprovado"
        assert painel["ana@example.com"]["ultima_avaliacao_em"] is not None
        assert painel["beto@example.com"]["ultima_avaliacao_em"] is None

    @pytest.mark.asyncio
    async def test_filtra_por_situacao(self, async_db, criar_usuario, cliente_api):
        await _incubado(async_db, criar_usuario, "ana@example.com")
        await _incubado(
            async_db, criar_usuario, "beto@example.com", SituacaoIncubacao.desistente
        )
        colaborador = await criar_usuario("colaborador")

        resposta = await (await cliente_api([router], colaborador)).get(
            "/usuarios?perfil=incubado&situacao=desistente"
        )

        assert [linha["email"] for linha in resposta.json()] == ["beto@example.com"]

    @pytest.mark.asyncio
    async def test_perfil_diferente_de_incubado_da_422(
        self, criar_usuario, cliente_api
    ):
        colaborador = await criar_usuario("colaborador")

        resposta = await (await cliente_api([router], colaborador)).get(
            "/usuarios?perfil=consultor"
        )

        assert resposta.status_code == 422

    @pytest.mark.asyncio
    @pytest.mark.parametrize("perfil", ["incubado", "consultor", "admin"])
    async def test_so_colaborador_ve_o_painel(self, criar_usuario, cliente_api, perfil):
        usuario = await criar_usuario(perfil)

        resposta = await (await cliente_api([router], usuario)).get(
            "/usuarios?perfil=incubado"
        )

        assert resposta.status_code == 403


class TestSituacao:
    @pytest.mark.asyncio
    async def test_colaborador_altera_e_o_historico_e_preservado(
        self, async_db, criar_usuario, cliente_api
    ):
        ana = await _incubado(async_db, criar_usuario, "ana@example.com")
        colaborador = await criar_usuario("colaborador")

        resposta = await (await cliente_api([router], colaborador)).patch(
            "/usuarios/ana@example.com/situacao", json={"situacao": "concluido"}
        )

        assert resposta.status_code == 200
        assert resposta.json()["situacao"] == "concluido"
        assert resposta.json()["alterada_por"] == colaborador.email
        assert ana.situacao_incubacao == SituacaoIncubacao.concluido
        assert (await async_db.get(Questionario, ana.email)) is not None

    @pytest.mark.asyncio
    async def test_usuario_sem_aprovacao_da_409_e_inexistente_da_404(
        self, criar_usuario, cliente_api
    ):
        await criar_usuario("incubado", "candidato@example.com")
        cliente = await cliente_api([router], await criar_usuario("colaborador"))

        sem_aprovacao = await cliente.patch(
            "/usuarios/candidato@example.com/situacao", json={"situacao": "ativo"}
        )
        inexistente = await cliente.patch(
            "/usuarios/ninguem@example.com/situacao", json={"situacao": "ativo"}
        )

        assert sem_aprovacao.status_code == 409
        assert inexistente.status_code == 404

    @pytest.mark.asyncio
    async def test_situacao_invalida_da_422_e_so_colaborador_altera(
        self, async_db, criar_usuario, cliente_api
    ):
        await _incubado(async_db, criar_usuario, "ana@example.com")
        colaborador = await cliente_api([router], await criar_usuario("colaborador"))
        incubado = await cliente_api([router], await criar_usuario("incubado"))

        invalida = await colaborador.patch(
            "/usuarios/ana@example.com/situacao", json={"situacao": "pausado"}
        )
        negada = await incubado.patch(
            "/usuarios/ana@example.com/situacao", json={"situacao": "concluido"}
        )

        assert invalida.status_code == 422
        assert negada.status_code == 403


class TestConsultor:
    @pytest.mark.asyncio
    async def test_consultor_le_o_plano_sem_designacao(
        self, async_db, criar_usuario, cliente_api
    ):
        await _incubado(async_db, criar_usuario, "ana@example.com")
        consultor = await criar_usuario("consultor")

        resposta = await (await cliente_api([router], consultor)).get(
            "/usuarios/ana@example.com/plano"
        )

        assert resposta.status_code != 403

    @pytest.mark.asyncio
    async def test_designacoes_nao_existem_mais(self, criar_usuario, cliente_api):
        cliente = await cliente_api([router], await criar_usuario("colaborador"))

        assert (await cliente.post("/designacoes", json={})).status_code == 404
        assert (await cliente.delete("/designacoes/1")).status_code == 404
