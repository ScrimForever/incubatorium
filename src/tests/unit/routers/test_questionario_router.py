from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from domain.models.questionarios.questionario import (
    Questionario,
    StatusEnum,
)
from infra.db import User
from routers.questionario.r_questionario import QuestionarioRouter


@pytest.fixture
async def setup_questionario_router(async_db: AsyncSession, sample_email):
    """Setup para router de questionário"""
    user = User(
        email=sample_email,
        hashed_password="hashed_pwd",
        is_active=True,
    )
    async_db.add(user)
    await async_db.commit()

    app = FastAPI()

    # Override dependencies
    from domain.models.user_model import current_active_user
    from infra.db import get_async_session

    def mock_get_user():
        return user

    async def mock_get_session():
        return async_db

    app.dependency_overrides[current_active_user] = mock_get_user
    app.dependency_overrides[get_async_session] = mock_get_session

    router = QuestionarioRouter(app)
    yield router, app

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_criar_questionario(setup_questionario_router, sample_email):
    """Teste para criar novo questionário"""
    router, app = setup_questionario_router

    client = TestClient(app)

    payload = {
        "status_questionario": StatusEnum.iniciado,
        "json_questionario": {"pergunta_1": "resposta_1"},
    }

    with patch(
        "routers.questionario.r_questionario.QuestionarioService"
    ) as mock_repo_class:
        mock_repo = MagicMock()
        mock_repo_class.return_value = mock_repo

        questionario = Questionario(
            usuario_email=sample_email,
            status_questionario=StatusEnum.iniciado,
            json_questionario={"pergunta_1": "resposta_1"},
        )

        mock_repo.criar = AsyncMock(return_value=questionario)

        await router.iniciar()

        response = client.post("/questionario", json=payload)

        assert response.status_code in [200, 422]


@pytest.mark.asyncio
async def test_buscar_questionario(setup_questionario_router, sample_email):
    """Teste para buscar questionário"""
    router, app = setup_questionario_router

    client = TestClient(app)

    with patch(
        "routers.questionario.r_questionario.QuestionarioService"
    ) as mock_repo_class:
        mock_repo = MagicMock()
        mock_repo_class.return_value = mock_repo

        questionario = Questionario(
            usuario_email=sample_email,
            status_questionario=StatusEnum.iniciado,
            json_questionario={},
        )

        mock_repo.buscar = AsyncMock(return_value=questionario)

        await router.iniciar()

        response = client.get("/questionario")

        assert response.status_code in [200, 422]


@pytest.mark.asyncio
async def test_atualizar_questionario(
    setup_questionario_router, async_db, sample_email
):
    """PUT grava as respostas de um questionário em preenchimento"""
    router, app = setup_questionario_router
    async_db.add(
        Questionario(
            usuario_email=sample_email,
            status_questionario=StatusEnum.iniciado,
            json_questionario={},
            criado_por=sample_email,
        )
    )
    await async_db.commit()

    await router.iniciar()
    from fastapi.testclient import TestClient

    from shared.handlers import registrar_handlers

    registrar_handlers(app)
    client = TestClient(app)

    payload = {
        "status_questionario": StatusEnum.pendente,
        "json_questionario": {"2": {"business_canvas": "Canvas"}},
    }
    response = client.put("/questionario", json=payload)

    assert response.status_code == 200
    assert response.json()["status_questionario"] == "pendente"


@pytest.mark.asyncio
async def test_atualizar_questionario_em_analise_da_409(
    setup_questionario_router, async_db, sample_email
):
    """PUT é bloqueado enquanto o pedido está em análise"""
    router, app = setup_questionario_router
    async_db.add(
        Questionario(
            usuario_email=sample_email,
            status_questionario=StatusEnum.aguardando_aprovacao,
            json_questionario={},
            criado_por=sample_email,
        )
    )
    await async_db.commit()

    await router.iniciar()
    response = TestClient(app).put(
        "/questionario",
        json={"status_questionario": "pendente", "json_questionario": {}},
    )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_incubado_nao_se_aprova_pelo_put(
    setup_questionario_router, async_db, sample_email
):
    """O incubado não consegue definir `aprovado` pelo PUT"""
    router, app = setup_questionario_router
    async_db.add(
        Questionario(
            usuario_email=sample_email,
            status_questionario=StatusEnum.pendente,
            json_questionario={},
            criado_por=sample_email,
        )
    )
    await async_db.commit()

    await router.iniciar()
    response = TestClient(app).put(
        "/questionario",
        json={"status_questionario": "aprovado", "json_questionario": {}},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_post_com_anexo_em_base64_da_422(setup_questionario_router):
    """Anexos entram só pelo endpoint de arquivos: base64 no JSON é recusado"""
    router, app = setup_questionario_router
    await router.iniciar()
    payload = {
        "status_questionario": "pendente",
        "json_questionario": {
            "6": {"arquivos": [{"nome": "balanco.pdf", "conteudo_base64": "JVBERi0="}]}
        },
    }

    response = TestClient(app).post("/questionario", json=payload)

    assert response.status_code == 422
    assert "POST /arquivos/questionario" in response.json()["mensagem"]


@pytest.mark.asyncio
async def test_post_descarta_referencias_forjadas_de_anexos(
    setup_questionario_router, async_db, sample_email
):
    """As referências de anexos são do servidor: a primeira gravação não as aceita"""
    router, app = setup_questionario_router
    await router.iniciar()
    payload = {
        "status_questionario": "pendente",
        "json_questionario": {
            "6": {
                "fornecedores": "x",
                "arquivos": [{"nome": "x.pdf", "caminho": "outro/6/x.pdf"}],
            }
        },
    }

    response = TestClient(app).post("/questionario", json=payload)

    assert response.status_code == 200
    gravado = await async_db.get(Questionario, sample_email)
    assert gravado.json_questionario["6"]["arquivos"] == []
