import pytest

from src.routers.avaliadores import router


@pytest.mark.asyncio
@pytest.mark.parametrize("perfil", ["colaborador", "consultor", "incubado"])
async def test_nao_admin_recebe_403(perfil, criar_usuario, cliente_api):
    solicitante = await criar_usuario(perfil)
    cliente = await cliente_api([router], solicitante)

    resposta = await cliente.get("/avaliadores")

    assert resposta.status_code == 403


@pytest.mark.asyncio
async def test_admin_lista_apenas_consultores(criar_usuario, cliente_api):
    admin = await criar_usuario("admin")
    consultor_b = await criar_usuario("consultor", "b-consultor@example.com")
    consultor_a = await criar_usuario("consultor", "a-consultor@example.com")
    await criar_usuario("colaborador", "colab@example.com")
    await criar_usuario("incubado", "incubado@example.com")
    cliente = await cliente_api([router], admin)

    resposta = await cliente.get("/avaliadores")

    assert resposta.status_code == 200
    emails = [u["email"] for u in resposta.json()]
    assert emails == [consultor_a.email, consultor_b.email]
    assert all(u["is_consultor"] is True for u in resposta.json())
    assert all("hashed_password" not in u for u in resposta.json())


@pytest.mark.asyncio
async def test_admin_sem_consultores_recebe_lista_vazia(criar_usuario, cliente_api):
    admin = await criar_usuario("admin")
    cliente = await cliente_api([router], admin)

    resposta = await cliente.get("/avaliadores")

    assert resposta.status_code == 200
    assert resposta.json() == []
