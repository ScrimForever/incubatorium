import pytest
from sqlalchemy import select

from src.domain.models.questionario import Questionario, StatusEnum
from src.domain.models.usuario import User
from src.routers.usuarios import router

PERFIS = ("is_admin", "is_colaborador", "is_consultor", "is_incubado")


def _corpo(email="novo@example.com", perfil="is_colaborador", **extra):
    corpo = {
        "email": email,
        "password": "senha-forte",
        "nome": "Ana",
        "sobrenome": "Silva",
        "telefone": "+55 11 999999999",
        **{p: False for p in PERFIS},
    }
    corpo[perfil] = True
    corpo.update(extra)
    return corpo


@pytest.mark.asyncio
@pytest.mark.parametrize("perfil_solicitante", ["colaborador", "consultor", "incubado"])
async def test_nao_admin_recebe_403(
    perfil_solicitante, criar_usuario, cliente_api, async_db
):
    solicitante = await criar_usuario(perfil_solicitante)
    cliente = await cliente_api([router], solicitante)

    resposta = await cliente.post("/usuarios", json=_corpo())

    assert resposta.status_code == 403
    assert (
        await async_db.scalar(select(User).where(User.email == "novo@example.com"))
        is None
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("perfil", PERFIS)
async def test_admin_cria_conta_ativa_sem_codigo_em_cada_perfil(
    perfil, criar_usuario, cliente_api, async_db
):
    admin = await criar_usuario("admin")
    cliente = await cliente_api([router], admin)

    resposta = await cliente.post("/usuarios", json=_corpo(perfil=perfil))

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["is_active"] is True
    assert corpo["email"] == "novo@example.com"
    assert all(corpo[p] is (p == perfil) for p in PERFIS)
    assert "hashed_password" not in corpo and "password" not in corpo

    criado = await async_db.scalar(select(User).where(User.email == "novo@example.com"))
    assert criado.is_active is True
    assert criado.codigo_ativacao is None
    assert (criado.nome, criado.sobrenome, criado.telefone) == (
        "Ana",
        "Silva",
        "+55 11 999999999",
    )
    assert criado.hashed_password != "senha-forte"


@pytest.mark.asyncio
async def test_incubado_criado_ganha_questionario_iniciado(
    criar_usuario, cliente_api, async_db
):
    admin = await criar_usuario("admin")
    cliente = await cliente_api([router], admin)

    await cliente.post("/usuarios", json=_corpo(perfil="is_incubado"))

    questionario = await async_db.scalar(
        select(Questionario).where(Questionario.usuario_email == "novo@example.com")
    )
    assert questionario.status_questionario == StatusEnum.iniciado
    assert questionario.criado_por == admin.email


@pytest.mark.asyncio
async def test_email_existente_retorna_409(criar_usuario, cliente_api):
    admin = await criar_usuario("admin")
    await criar_usuario("colaborador", "novo@example.com")
    cliente = await cliente_api([router], admin)

    resposta = await cliente.post("/usuarios", json=_corpo())

    assert resposta.status_code == 409
    assert resposta.json() == {"mensagem": "E-mail já cadastrado."}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "marcados",
    [[], ["is_admin", "is_consultor"]],
)
async def test_exige_exatamente_um_perfil(marcados, criar_usuario, cliente_api):
    admin = await criar_usuario("admin")
    cliente = await cliente_api([router], admin)
    corpo = {
        "email": "novo@example.com",
        "password": "senha",
        "nome": "Ana",
        "sobrenome": "Silva",
        "telefone": "+55 11 999999999",
        **{p: False for p in PERFIS},
    }
    for p in marcados:
        corpo[p] = True

    resposta = await cliente.post("/usuarios", json=corpo)

    assert resposta.status_code == 422


@pytest.fixture
def email_cadastro(monkeypatch):
    from unittest.mock import AsyncMock

    from src.services.email.setup import EmailSetup

    mock = AsyncMock(return_value=True)
    monkeypatch.setattr(EmailSetup, "enviar_email_cadastro", mock)
    return mock


@pytest.mark.asyncio
@pytest.mark.parametrize("sem_senha", [{"password": ""}, {"password": "   "}, None])
@pytest.mark.parametrize("perfil", PERFIS)
async def test_sem_senha_cria_conta_inativa_e_envia_codigo(
    perfil, sem_senha, criar_usuario, cliente_api, async_db, email_cadastro
):
    admin = await criar_usuario("admin")
    cliente = await cliente_api([router], admin)
    corpo = _corpo(perfil=perfil, **(sem_senha or {}))
    if sem_senha is None:
        del corpo["password"]

    resposta = await cliente.post("/usuarios", json=corpo)

    assert resposta.status_code == 201
    assert resposta.json()["is_active"] is False
    criado = await async_db.scalar(select(User).where(User.email == "novo@example.com"))
    assert criado.is_active is False
    assert criado.codigo_ativacao and len(criado.codigo_ativacao) == 6
    assert criado.hashed_password
    email_cadastro.assert_awaited_once_with(
        "novo@example.com", criado.codigo_ativacao, definir_senha=True
    )
    questionarios = await async_db.scalars(
        select(Questionario).where(Questionario.usuario_email == "novo@example.com")
    )
    assert questionarios.all() == []


@pytest.mark.asyncio
async def test_com_senha_nao_envia_codigo(criar_usuario, cliente_api, email_cadastro):
    admin = await criar_usuario("admin")
    cliente = await cliente_api([router], admin)

    resposta = await cliente.post("/usuarios", json=_corpo())

    assert resposta.status_code == 201
    email_cadastro.assert_not_awaited()


@pytest.mark.asyncio
async def test_falha_no_envio_nao_impede_cadastro(
    criar_usuario, cliente_api, async_db, email_cadastro
):
    email_cadastro.return_value = False
    admin = await criar_usuario("admin")
    cliente = await cliente_api([router], admin)

    resposta = await cliente.post("/usuarios", json=_corpo(password=""))

    assert resposta.status_code == 201
    criado = await async_db.scalar(select(User).where(User.email == "novo@example.com"))
    assert criado.is_active is False and criado.codigo_ativacao
