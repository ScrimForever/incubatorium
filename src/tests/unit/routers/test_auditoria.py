"""Histórico de acesso: logins e trocas de senha, pelas rotas reais do fastapi-users."""

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from fastapi_users.password import PasswordHelper
from sqlalchemy import select

from src.domain.models.auditoria import EventoAcesso, MotivoAcesso, RegistroAcesso
from src.domain.models.usuario import User
from src.infra.db import get_async_session
from src.routers import auditoria, usuarios
from src.routers.auth import auth_router
from src.services.email.setup import EmailSetup
from src.shared.handlers import registrar_handlers

SENHA = "senha-correta-123"
CABECALHOS = {"X-Real-IP": "203.0.113.7", "User-Agent": "teste/1.0"}


@pytest_asyncio.fixture
async def cliente(async_db):
    """App com as rotas reais de auth: o usuário vem do token, não de override."""
    app = FastAPI()
    registrar_handlers(app)
    for router in (auth_router.router, usuarios.router, auditoria.router):
        app.include_router(router)

    async def _sessao():
        return async_db

    app.dependency_overrides[get_async_session] = _sessao
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        headers=CABECALHOS,
    ) as c:
        yield c


@pytest_asyncio.fixture
async def conta(async_db, criar_usuario):
    async def _criar(perfil="incubado", email=None, ativo=True) -> User:
        usuario = await criar_usuario(perfil, email)
        usuario.hashed_password = PasswordHelper().hash(SENHA)
        usuario.is_active = ativo
        await async_db.commit()
        return usuario

    return _criar


async def _login(cliente, email, senha=SENHA):
    return await cliente.post(
        "/auth/jwt/login", data={"username": email, "password": senha}
    )


async def _token(cliente, email):
    resposta = await _login(cliente, email)
    assert resposta.status_code == 200
    return {"Authorization": f"Bearer {resposta.json()['access_token']}"}


async def _registros(async_db, evento=None):
    consulta = select(RegistroAcesso).order_by(RegistroAcesso.id)
    if evento is not None:
        consulta = consulta.where(RegistroAcesso.evento == evento)
    return list((await async_db.execute(consulta)).scalars().all())


@pytest.mark.asyncio
async def test_login_com_sucesso_registra_ip_e_user_agent(cliente, conta, async_db):
    usuario = await conta(email="ana@example.com")

    assert (await _login(cliente, "ana@example.com")).status_code == 200

    [registro] = await _registros(async_db)
    assert registro.evento == EventoAcesso.login_sucesso
    assert (registro.email, registro.usuario_id) == ("ana@example.com", usuario.id)
    assert (registro.ip, registro.user_agent) == ("203.0.113.7", "teste/1.0")
    assert registro.criado_em is not None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("email", "senha", "ativo", "motivo"),
    [
        ("ana@example.com", "errada", True, MotivoAcesso.credenciais_invalidas),
        ("ninguem@example.com", SENHA, True, MotivoAcesso.credenciais_invalidas),
        ("ana@example.com", SENHA, False, MotivoAcesso.conta_inativa),
    ],
)
async def test_login_recusado_registra_falha(
    email, senha, ativo, motivo, cliente, conta, async_db
):
    await conta(email="ana@example.com", ativo=ativo)

    assert (await _login(cliente, email, senha)).status_code == 400

    [registro] = await _registros(async_db)
    assert (registro.evento, registro.motivo) == (EventoAcesso.login_falha, motivo)
    assert registro.email == email
    assert registro.ip == "203.0.113.7"


@pytest.mark.asyncio
async def test_usuario_troca_a_propria_senha(cliente, conta, async_db):
    await conta(email="ana@example.com")
    auth = await _token(cliente, "ana@example.com")

    resposta = await cliente.patch(
        "/users/me", json={"password": "nova-senha-123"}, headers=auth
    )

    assert resposta.status_code == 200
    [registro] = await _registros(async_db, EventoAcesso.senha_alterada)
    assert registro.motivo == MotivoAcesso.propria
    assert registro.autor_email == "ana@example.com"


@pytest.mark.asyncio
async def test_editar_dados_sem_senha_nao_registra(cliente, conta, async_db):
    await conta(email="ana@example.com")
    auth = await _token(cliente, "ana@example.com")

    await cliente.patch("/users/me", json={"is_active": True}, headers=auth)

    assert await _registros(async_db, EventoAcesso.senha_alterada) == []


@pytest.mark.asyncio
async def test_recuperacao_de_senha_registra(cliente, conta, async_db, monkeypatch):
    await conta(email="ana@example.com")
    tokens = []

    async def _capturar(self, email, token):
        tokens.append(token)

    monkeypatch.setattr(EmailSetup, "enviar_email_nova_senha", _capturar)

    await cliente.post("/auth/forgot-password", json={"email": "ana@example.com"})
    resposta = await cliente.post(
        "/auth/reset-password", json={"token": tokens[0], "password": "nova-123456"}
    )

    assert resposta.status_code == 200
    [registro] = await _registros(async_db, EventoAcesso.senha_alterada)
    assert registro.motivo == MotivoAcesso.recuperacao
    assert registro.ip == "203.0.113.7"


@pytest.mark.asyncio
async def test_admin_troca_senha_de_outro_registra_o_autor(cliente, conta, async_db):
    await conta("admin", "admin@example.com")
    alvo = await conta(email="ana@example.com")
    auth = await _token(cliente, "admin@example.com")

    resposta = await cliente.patch(
        "/usuarios/ana@example.com", json={"password": "nova-senha"}, headers=auth
    )

    assert resposta.status_code == 200
    [registro] = await _registros(async_db, EventoAcesso.senha_alterada)
    assert registro.motivo == MotivoAcesso.administrador
    assert (registro.email, registro.usuario_id) == ("ana@example.com", alvo.id)
    assert registro.autor_email == "admin@example.com"
    assert registro.ip == "203.0.113.7"


@pytest.mark.asyncio
async def test_admin_consulta_historico_com_filtros(cliente, conta, async_db):
    await conta("admin", "admin@example.com")
    await conta(email="ana@example.com")
    await _login(cliente, "ana@example.com", "errada")
    await _login(cliente, "ana@example.com")
    auth = await _token(cliente, "admin@example.com")

    resposta = await cliente.get(
        "/auditoria/acessos", params={"email": "ana@example.com"}, headers=auth
    )

    assert resposta.status_code == 200
    eventos = [r["evento"] for r in resposta.json()]
    assert eventos == ["login_sucesso", "login_falha"]  # mais recente primeiro

    resposta = await cliente.get(
        "/auditoria/acessos", params={"evento": "login_falha"}, headers=auth
    )
    [falha] = resposta.json()
    assert (falha["email"], falha["motivo"]) == (
        "ana@example.com",
        "credenciais_invalidas",
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("perfil", ["colaborador", "consultor", "incubado"])
async def test_nao_admin_nao_consulta_historico(perfil, cliente, conta):
    await conta(perfil, "x@example.com")
    auth = await _token(cliente, "x@example.com")

    resposta = await cliente.get("/auditoria/acessos", headers=auth)

    assert resposta.status_code == 403
