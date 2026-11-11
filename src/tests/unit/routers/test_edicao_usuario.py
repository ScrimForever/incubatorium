import pytest
from fastapi_users.password import PasswordHelper
from sqlalchemy import select

from src.domain.models.questionario import Questionario
from src.domain.models.usuario import User
from src.routers.usuarios import router

PERFIS = ("is_admin", "is_colaborador", "is_consultor", "is_incubado")


async def _buscar(async_db, email):
    async_db.expire_all()
    return await async_db.scalar(select(User).where(User.email == email))


@pytest.mark.asyncio
@pytest.mark.parametrize("perfil", ["colaborador", "consultor", "incubado"])
async def test_nao_admin_recebe_403(perfil, criar_usuario, cliente_api, async_db):
    solicitante = await criar_usuario(perfil)
    alvo = await criar_usuario("colaborador", "alvo@example.com")
    cliente = await cliente_api([router], solicitante)

    resposta = await cliente.patch(f"/usuarios/{alvo.email}", json={"nome": "X"})

    assert resposta.status_code == 403
    assert (await _buscar(async_db, alvo.email)).nome is None


@pytest.mark.asyncio
async def test_admin_edita_apenas_campos_enviados(criar_usuario, cliente_api, async_db):
    admin = await criar_usuario("admin")
    alvo = await criar_usuario("colaborador", "alvo@example.com")
    alvo.sobrenome = "Silva"
    await async_db.commit()
    cliente = await cliente_api([router], admin)

    resposta = await cliente.patch(
        "/usuarios/alvo@example.com",
        json={"nome": "Ana", "telefone": "+55 11 988887777", "is_active": False},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["nome"] == "Ana"
    assert corpo["sobrenome"] == "Silva"
    assert corpo["telefone"] == "+55 11 988887777"
    assert corpo["is_active"] is False
    assert corpo["is_colaborador"] is True
    assert "hashed_password" not in corpo and "codigo_ativacao" not in corpo
    salvo = await _buscar(async_db, "alvo@example.com")
    assert (salvo.nome, salvo.sobrenome, salvo.is_active) == ("Ana", "Silva", False)


@pytest.mark.asyncio
async def test_admin_troca_senha_gravando_hash(criar_usuario, cliente_api, async_db):
    admin = await criar_usuario("admin")
    await criar_usuario("consultor", "alvo@example.com")
    cliente = await cliente_api([router], admin)

    resposta = await cliente.patch(
        "/usuarios/alvo@example.com", json={"password": "nova-senha"}
    )

    assert resposta.status_code == 200
    salvo = await _buscar(async_db, "alvo@example.com")
    assert salvo.hashed_password != "nova-senha"
    valida, _ = PasswordHelper().verify_and_update("nova-senha", salvo.hashed_password)
    assert valida


@pytest.mark.asyncio
async def test_troca_de_perfil_zera_os_demais(criar_usuario, cliente_api, async_db):
    admin = await criar_usuario("admin")
    await criar_usuario("colaborador", "alvo@example.com")
    cliente = await cliente_api([router], admin)

    resposta = await cliente.patch(
        "/usuarios/alvo@example.com", json={"is_consultor": True}
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert all(corpo[p] is (p == "is_consultor") for p in PERFIS)


@pytest.mark.asyncio
async def test_virar_incubado_cria_questionario_inicial(
    criar_usuario, cliente_api, async_db
):
    admin = await criar_usuario("admin")
    await criar_usuario("consultor", "alvo@example.com")
    cliente = await cliente_api([router], admin)

    resposta = await cliente.patch(
        "/usuarios/alvo@example.com", json={"is_incubado": True}
    )

    assert resposta.status_code == 200
    questionario = await async_db.scalar(
        select(Questionario).where(Questionario.usuario_email == "alvo@example.com")
    )
    assert questionario is not None
    assert questionario.criado_por == admin.email


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "corpo",
    [
        {"is_admin": False},
        {"is_admin": True, "is_consultor": True},
        {"is_consultor": None},
        {"is_active": None},
        {"password": ""},
        {"email": "outro@example.com"},
        {"situacao_incubacao": "ativo"},
    ],
)
async def test_corpo_invalido_retorna_422(corpo, criar_usuario, cliente_api):
    admin = await criar_usuario("admin")
    await criar_usuario("colaborador", "alvo@example.com")
    cliente = await cliente_api([router], admin)

    resposta = await cliente.patch("/usuarios/alvo@example.com", json=corpo)

    assert resposta.status_code == 422


@pytest.mark.asyncio
async def test_usuario_inexistente_retorna_404(criar_usuario, cliente_api):
    admin = await criar_usuario("admin")
    cliente = await cliente_api([router], admin)

    resposta = await cliente.patch("/usuarios/nao-existe@example.com", json={})

    assert resposta.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("corpo", [{"is_colaborador": True}, {"is_active": False}])
async def test_admin_nao_remove_o_proprio_acesso(
    corpo, criar_usuario, cliente_api, async_db
):
    admin = await criar_usuario("admin", "admin@example.com")
    cliente = await cliente_api([router], admin)

    resposta = await cliente.patch("/usuarios/admin@example.com", json=corpo)

    assert resposta.status_code == 409
    salvo = await _buscar(async_db, "admin@example.com")
    assert salvo.is_admin is True and salvo.is_active is True


async def _pendente(async_db, perfil_flag):
    usuario = User(
        email="pendente@example.com",
        hashed_password="hashed_pwd",
        is_incubado=perfil_flag == "is_incubado",
        is_consultor=perfil_flag == "is_consultor",
    )
    async_db.add(usuario)
    await async_db.commit()
    return usuario


@pytest.mark.asyncio
async def test_pendente_que_vira_incubado_so_ganha_questionario_na_ativacao(
    criar_usuario, cliente_api, async_db
):
    admin = await criar_usuario("admin")
    await _pendente(async_db, "is_consultor")
    cliente = await cliente_api([router], admin)

    resposta = await cliente.patch(
        "/usuarios/pendente@example.com", json={"is_incubado": True}
    )

    assert resposta.status_code == 200
    salvo = await _buscar(async_db, "pendente@example.com")
    assert salvo.is_active is False and salvo.codigo_ativacao
    assert (
        await async_db.scalar(
            select(Questionario).where(
                Questionario.usuario_email == "pendente@example.com"
            )
        )
        is None
    )


@pytest.mark.asyncio
async def test_ativacao_manual_descarta_codigo_e_cria_questionario(
    criar_usuario, cliente_api, async_db
):
    admin = await criar_usuario("admin")
    await _pendente(async_db, "is_incubado")
    cliente = await cliente_api([router], admin)

    resposta = await cliente.patch(
        "/usuarios/pendente@example.com", json={"is_active": True}
    )

    assert resposta.status_code == 200
    salvo = await _buscar(async_db, "pendente@example.com")
    assert salvo.is_active is True and salvo.codigo_ativacao is None
    assert await async_db.scalar(
        select(Questionario).where(Questionario.usuario_email == "pendente@example.com")
    )
