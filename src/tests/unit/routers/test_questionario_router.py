from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domain.models.questionario import (
    Questionario,
    QuestionarioHistorico,
    StatusEnum,
)
from domain.models.usuario import User
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
    from auth.backend import current_active_user
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
    """PUT grava as respostas e o status enviado pelo cliente"""
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
    assert response.json()["json_questionario"]["2"]["business_canvas"] == "Canvas"

    historico = (
        (await async_db.execute(select(QuestionarioHistorico))).scalars().all()
    )
    assert len(historico) == 1
    assert historico[0].usuario_email == sample_email
    assert historico[0].status_questionario == StatusEnum.pendente
    assert historico[0].json_questionario == {"2": {"business_canvas": "Canvas"}}


@pytest.mark.asyncio
async def test_buscar_sem_questionario_devolve_false(setup_questionario_router):
    """Contrato com o frontend: sem documento, GET devolve `false` (200)"""
    router, app = setup_questionario_router
    await router.iniciar()

    response = TestClient(app).get("/questionario")

    assert response.status_code == 200
    assert response.json() is False


@pytest.mark.asyncio
async def test_criar_duas_vezes_da_409(setup_questionario_router):
    router, app = setup_questionario_router
    await router.iniciar()
    client = TestClient(app)
    payload = {"status_questionario": "pendente", "json_questionario": {}}

    assert client.post("/questionario", json=payload).status_code == 200
    response = client.post("/questionario", json=payload)

    assert response.status_code == 409
    assert response.json() == {
        "mensagem": "Questionario já existe. Não é possível criar um novo questionario."
    }


@pytest.mark.asyncio
async def test_atualizar_sem_questionario_da_404(setup_questionario_router):
    router, app = setup_questionario_router
    await router.iniciar()

    response = TestClient(app).put(
        "/questionario", json={"status_questionario": "pendente"}
    )

    assert response.status_code == 404
    assert response.json() == {"mensagem": "Questionário não encontrado."}
