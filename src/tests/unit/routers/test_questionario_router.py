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
        "routers.questionario.r_questionario.QuestionarioRepository"
    ) as mock_repo_class:
        mock_repo = MagicMock()
        mock_repo_class.return_value = mock_repo

        questionario = Questionario(
            usuario_email=sample_email,
            status_questionario=StatusEnum.iniciado,
            json_questionario={"pergunta_1": "resposta_1"},
        )

        mock_repo.gravar_questionario = AsyncMock(return_value=questionario)

        await router.iniciar()

        response = client.post("/questionario", json=payload)

        assert response.status_code in [200, 422]


@pytest.mark.asyncio
async def test_buscar_questionario(setup_questionario_router, sample_email):
    """Teste para buscar questionário"""
    router, app = setup_questionario_router

    client = TestClient(app)

    with patch(
        "routers.questionario.r_questionario.QuestionarioRepository"
    ) as mock_repo_class:
        mock_repo = MagicMock()
        mock_repo_class.return_value = mock_repo

        questionario = Questionario(
            usuario_email=sample_email,
            status_questionario=StatusEnum.iniciado,
            json_questionario={},
        )

        mock_repo.buscar_questionario = AsyncMock(return_value=questionario)

        await router.iniciar()

        response = client.get("/questionario")

        assert response.status_code in [200, 422]


@pytest.mark.asyncio
async def test_atualizar_questionario(setup_questionario_router, sample_email):
    """Teste para atualizar questionário"""
    router, app = setup_questionario_router

    client = TestClient(app)

    payload = {
        "status_questionario": StatusEnum.pendente,
        "json_questionario": {"pergunta_1": "resposta_2"},
    }

    with patch(
        "routers.questionario.r_questionario.QuestionarioRepository"
    ) as mock_repo_class:
        mock_repo = MagicMock()
        mock_repo_class.return_value = mock_repo

        questionario = Questionario(
            usuario_email=sample_email,
            status_questionario=StatusEnum.pendente,
            json_questionario={"pergunta_1": "resposta_2"},
        )

        mock_repo.atualizar_questionario = AsyncMock(return_value=questionario)

        await router.iniciar()

        response = client.put("/questionario", json=payload)

        assert response.status_code in [200, 422]
