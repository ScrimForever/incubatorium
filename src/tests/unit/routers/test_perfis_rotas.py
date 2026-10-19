"""Matriz de perfis das rotas de questionário e arquivos."""

import pytest

from routers.arquivos import router as router_arquivos
from routers.questionario import router as router_questionario


async def _router_questionario():
    return router_questionario


async def _router_arquivos():
    return router_arquivos


@pytest.mark.asyncio
@pytest.mark.parametrize("perfil", ["incubado", "colaborador", "consultor"])
async def test_listar_todos_so_equipe_e_admin(criar_usuario, cliente_api, perfil):
    usuario = await criar_usuario(perfil)
    cliente = await cliente_api([await _router_questionario()], usuario)

    resposta = await cliente.get("/questionario/todos")

    assert (resposta.status_code == 403) == (perfil == "incubado")


@pytest.mark.asyncio
async def test_listar_todos_admin_passa(criar_usuario, cliente_api):
    admin = await criar_usuario("admin")
    cliente = await cliente_api([await _router_questionario()], admin)

    assert (await cliente.get("/questionario/todos")).status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("perfil", ["colaborador", "consultor"])
async def test_questionario_proprio_e_so_de_incubado(
    criar_usuario, cliente_api, perfil
):
    usuario = await criar_usuario(perfil)
    cliente = await cliente_api([await _router_questionario()], usuario)

    assert (await cliente.get("/questionario")).status_code == 403


@pytest.mark.asyncio
async def test_arquivos_negam_usuario_sem_perfil(criar_usuario, async_db, cliente_api):
    usuario = await criar_usuario("incubado")
    usuario.is_incubado = False
    await async_db.commit()
    cliente = await cliente_api([await _router_arquivos()], usuario)

    resposta = await cliente.get("/arquivos/questionario/nome-arquivo/1")

    assert resposta.status_code == 403
