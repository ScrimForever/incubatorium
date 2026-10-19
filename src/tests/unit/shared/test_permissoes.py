import pytest
from fastapi import HTTPException

from shared import permissoes


class TestExigirPerfil:
    @pytest.mark.asyncio
    async def test_perfil_listado_passa(self, criar_usuario):
        usuario = await criar_usuario("colaborador")
        dependencia = permissoes.exigir_perfil("colaborador")
        assert await dependencia(usuario) is usuario

    @pytest.mark.asyncio
    async def test_qualquer_perfil_da_lista_passa(self, criar_usuario):
        dependencia = permissoes.exigir_perfil("colaborador", "consultor")
        for perfil in ("colaborador", "consultor"):
            usuario = await criar_usuario(perfil)
            assert await dependencia(usuario) is usuario

    @pytest.mark.asyncio
    @pytest.mark.parametrize("perfil", ["consultor", "incubado"])
    async def test_perfil_nao_listado_recebe_403(self, criar_usuario, perfil):
        usuario = await criar_usuario(perfil)
        with pytest.raises(HTTPException) as erro:
            await permissoes.exigir_perfil("colaborador")(usuario)
        assert erro.value.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_passa_em_qualquer_rota(self, criar_usuario):
        admin = await criar_usuario("admin")
        assert await permissoes.exigir_perfil("consultor")(admin) is admin

    @pytest.mark.asyncio
    async def test_usuario_sem_perfil_recebe_403(self, criar_usuario):
        usuario = await criar_usuario("incubado")
        usuario.is_incubado = False
        with pytest.raises(HTTPException) as erro:
            await permissoes.exigir_perfil("incubado", "colaborador")(usuario)
        assert erro.value.status_code == 403

    def test_perfil_inexistente_falha_na_definicao_da_rota(self):
        with pytest.raises(ValueError):
            permissoes.exigir_perfil("coladorador")


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
    async def test_alvo_inexistente_ou_nao_incubado_recebe_404(
        self, async_db, criar_usuario
    ):
        colaborador = await criar_usuario("colaborador")
        outro_colaborador = await criar_usuario("colaborador")
        for email in ("nao-existe@example.com", outro_colaborador.email):
            with pytest.raises(HTTPException) as erro:
                await permissoes.exigir_acesso_incubado(email, colaborador, async_db)
            assert erro.value.status_code == 404
