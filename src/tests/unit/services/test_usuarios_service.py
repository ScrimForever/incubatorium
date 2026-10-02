from unittest.mock import AsyncMock, MagicMock

import pytest

from domain.models.enums import SituacaoIncubacao
from domain.models.questionarios.questionario import Questionario, StatusEnum
from domain.schemas.avaliacao_schema import AvaliacaoInput
from services.avaliacoes.avaliacoes_service import AvaliacoesService
from services.usuarios.usuarios_service import UsuariosService
from shared.exceptions import ConflitoError, NaoEncontradoError


async def _incubado_aprovado(async_db, criar_usuario):
    usuario = await criar_usuario("incubado", "ana@example.com")
    async_db.add(
        Questionario(
            usuario_email=usuario.email,
            status_questionario=StatusEnum.aprovado,
            json_questionario={"2": {"business_canvas": "Canvas"}},
            criado_por=usuario.email,
        )
    )
    usuario.situacao_incubacao = SituacaoIncubacao.ativo
    await async_db.commit()
    return usuario


class TestAlterarSituacao:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "situacao", [SituacaoIncubacao.concluido, SituacaoIncubacao.desistente]
    )
    async def test_encerrada_bloqueia_novas_avaliacoes(
        self, async_db, criar_usuario, situacao
    ):
        incubado = await _incubado_aprovado(async_db, criar_usuario)
        consultor = await criar_usuario("consultor")
        colaborador = await criar_usuario("colaborador")
        await UsuariosService(async_db).alterar_situacao(
            colaborador, incubado.email, situacao
        )

        assert incubado.situacao_incubacao == situacao
        email = MagicMock()
        email.enviar_email_nova_avaliacao = AsyncMock()
        with pytest.raises(ConflitoError):
            await AvaliacoesService(async_db, email_service=email).avaliar(
                consultor, incubado.email, 2, AvaliacaoInput(nota=3, parecer="x")
            )
        email.enviar_email_nova_avaliacao.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_reativar_libera_de_novo_e_o_historico_fica(
        self, async_db, criar_usuario
    ):
        incubado = await _incubado_aprovado(async_db, criar_usuario)
        colaborador = await criar_usuario("colaborador")
        service = UsuariosService(async_db)

        await service.alterar_situacao(
            colaborador, incubado.email, SituacaoIncubacao.desistente
        )
        await service.alterar_situacao(
            colaborador, incubado.email, SituacaoIncubacao.ativo
        )

        assert incubado.situacao_incubacao == SituacaoIncubacao.ativo
        assert incubado.situacao_alterada_por == colaborador.email
        assert incubado.situacao_alterada_em is not None
        assert await async_db.get(Questionario, incubado.email) is not None

    @pytest.mark.asyncio
    async def test_sem_aprovacao_e_nao_incubado(self, async_db, criar_usuario):
        candidato = await criar_usuario("incubado")
        equipe = await criar_usuario("consultor")
        colaborador = await criar_usuario("colaborador")
        service = UsuariosService(async_db)

        with pytest.raises(ConflitoError):
            await service.alterar_situacao(
                colaborador, candidato.email, SituacaoIncubacao.concluido
            )
        with pytest.raises(NaoEncontradoError):
            await service.alterar_situacao(
                colaborador, equipe.email, SituacaoIncubacao.concluido
            )


class TestPainel:
    @pytest.mark.asyncio
    async def test_painel_so_traz_aprovados(self, async_db, criar_usuario):
        await _incubado_aprovado(async_db, criar_usuario)
        await criar_usuario("incubado", "candidato@example.com")

        painel = await UsuariosService(async_db).painel()

        assert [linha["email"] for linha in painel] == ["ana@example.com"]


class TestPlano:
    @pytest.mark.asyncio
    async def test_devolve_o_questionario_vigente_ou_404(self, async_db, criar_usuario):
        incubado = await _incubado_aprovado(async_db, criar_usuario)
        sem_plano = await criar_usuario("incubado")
        service = UsuariosService(async_db)

        plano = await service.plano(incubado.email)

        assert plano.usuario_email == incubado.email
        with pytest.raises(NaoEncontradoError):
            await service.plano(sem_plano.email)
