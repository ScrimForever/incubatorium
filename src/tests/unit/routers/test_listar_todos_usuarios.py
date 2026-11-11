import pytest

from src.domain.models.enums import SituacaoIncubacao
from src.routers.usuarios import router


@pytest.mark.asyncio
@pytest.mark.parametrize("perfil", ["colaborador", "consultor", "incubado"])
async def test_nao_admin_recebe_403(perfil, criar_usuario, cliente_api):
    solicitante = await criar_usuario(perfil)
    cliente = await cliente_api([router], solicitante)

    resposta = await cliente.get("/usuarios/todos")

    assert resposta.status_code == 403


@pytest.mark.asyncio
async def test_admin_lista_todos_os_perfis_ordenados_por_email(
    criar_usuario, cliente_api, async_db
):
    admin = await criar_usuario("admin", "d-admin@example.com")
    await criar_usuario("consultor", "b-consultor@example.com")
    await criar_usuario("colaborador", "c-colab@example.com")
    incubado = await criar_usuario("incubado", "a-incubado@example.com")
    incubado.nome = "Ana"
    incubado.situacao_incubacao = SituacaoIncubacao.ativo
    await async_db.commit()
    cliente = await cliente_api([router], admin)

    resposta = await cliente.get("/usuarios/todos")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert [u["email"] for u in corpo] == [
        "a-incubado@example.com",
        "b-consultor@example.com",
        "c-colab@example.com",
        "d-admin@example.com",
    ]
    primeiro = corpo[0]
    assert primeiro["is_incubado"] is True
    assert primeiro["nome"] == "Ana"
    assert primeiro["situacao_incubacao"] == SituacaoIncubacao.ativo.value
    for campo in ("id", "is_active", "telefone", "situacao_alterada_em"):
        assert campo in primeiro
    assert all("hashed_password" not in u for u in corpo)
    assert all("codigo_ativacao" not in u for u in corpo)
