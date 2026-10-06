import pytest
from fastapi import HTTPException

from shared import permissoes


class TestExigirColaborador:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("perfil", ["admin", "consultor", "incubado"])
    async def test_outros_perfis_recebem_403(self, criar_usuario, perfil):
        usuario = await criar_usuario(perfil)
        with pytest.raises(HTTPException) as erro:
            await permissoes.exigir_colaborador(usuario)
        assert erro.value.status_code == 403

    @pytest.mark.asyncio
    async def test_colaborador_passa(self, criar_usuario):
        usuario = await criar_usuario("colaborador")
        assert await permissoes.exigir_colaborador(usuario) is usuario


class TestExigirAcessoIncubado:
    @pytest.mark.asyncio
    async def test_proprio_incubado_acessa(self, async_db, criar_usuario):
        incubado = await criar_usuario("incubado")
        alvo = await permissoes.exigir_acesso_incubado(
            incubado.email, incubado, async_db
        )
        assert alvo.email == incubado.email

    @pytest.mark.asyncio
    async def test_colaborador_acessa_qualquer_incubado(self, async_db, criar_usuario):
        incubado = await criar_usuario("incubado")
        colaborador = await criar_usuario("colaborador")
        alvo = await permissoes.exigir_acesso_incubado(
            incubado.email, colaborador, async_db
        )
        assert alvo.email == incubado.email

    @pytest.mark.asyncio
    async def test_outro_incubado_recebe_403(self, async_db, criar_usuario):
        incubado = await criar_usuario("incubado")
        outro = await criar_usuario("incubado")
        with pytest.raises(HTTPException) as erro:
            await permissoes.exigir_acesso_incubado(incubado.email, outro, async_db)
        assert erro.value.status_code == 403

    @pytest.mark.asyncio
    async def test_consultor_acessa_sem_designacao(self, async_db, criar_usuario):
        incubado = await criar_usuario("incubado")
        consultor = await criar_usuario("consultor")
        alvo = await permissoes.exigir_acesso_incubado(
            incubado.email, consultor, async_db
        )
        assert alvo.email == incubado.email

    @pytest.mark.asyncio
    @pytest.mark.parametrize("perfil", ["incubado", "colaborador", "admin"])
    async def test_exigir_consultor_nega_outros_perfis(self, criar_usuario, perfil):
        with pytest.raises(HTTPException) as erro:
            await permissoes.exigir_consultor(await criar_usuario(perfil))
        assert erro.value.status_code == 403

    @pytest.mark.asyncio
    async def test_exigir_consultor_aceita_consultor(self, criar_usuario):
        consultor = await criar_usuario("consultor")
        assert await permissoes.exigir_consultor(consultor) is consultor

    @pytest.mark.asyncio
    async def test_alvo_inexistente_ou_nao_incubado_recebe_404(
        self, async_db, criar_usuario
    ):
        colaborador = await criar_usuario("colaborador")
        outro_colaborador = await criar_usuario("colaborador")
        for email in ("nao-existe@example.com", outro_colaborador.email):
            with pytest.raises(HTTPException) as erro:
                await permissoes.exigir_acesso_incubado(email, colaborador, async_db)
            assert erro.value.status_code == 404
