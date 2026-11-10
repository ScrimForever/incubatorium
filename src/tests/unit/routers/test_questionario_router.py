from unittest.mock import AsyncMock, MagicMock

import pytest
import httpx
from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.models.questionario import (
    Questionario,
    QuestionarioHistorico,
    StatusEnum,
)
from src.domain.models.usuario import User
from src.routers.dependencias import get_questionario_service
from src.routers.questionario import router as questionario_router
from src.shared.handlers import registrar_handlers


def _cliente(app: FastAPI) -> httpx.AsyncClient:
    """Cliente no mesmo event loop do teste: a sessão Postgres (asyncpg) não cruza loops."""
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


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
    registrar_handlers(app)

    # Override dependencies
    from src.auth.backend import current_active_user
    from src.infra.db import get_async_session

    def mock_get_user():
        return user

    async def mock_get_session():
        return async_db

    app.dependency_overrides[current_active_user] = mock_get_user
    app.dependency_overrides[get_async_session] = mock_get_session

    app.include_router(questionario_router)
    yield app

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_criar_questionario(setup_questionario_router, sample_email):
    """Teste para criar novo questionário"""
    app = setup_questionario_router

    client = _cliente(app)

    payload = {
        "status_questionario": StatusEnum.iniciado,
        "json_questionario": {"pergunta_1": "resposta_1"},
    }

    mock_repo = MagicMock()
    app.dependency_overrides[get_questionario_service] = lambda: mock_repo

    questionario = Questionario(
        id=1,
        usuario_email=sample_email,
        status_questionario=StatusEnum.iniciado,
        json_questionario={"pergunta_1": "resposta_1"},
    )

    mock_repo.criar = AsyncMock(return_value=questionario)

    response = await client.post("/questionario", json=payload)

    assert response.status_code in [200, 422]


@pytest.mark.asyncio
async def test_buscar_questionario(setup_questionario_router, sample_email):
    """Teste para buscar questionário"""
    app = setup_questionario_router

    client = _cliente(app)

    mock_repo = MagicMock()
    app.dependency_overrides[get_questionario_service] = lambda: mock_repo

    questionario = Questionario(
        id=1,
        usuario_email=sample_email,
        status_questionario=StatusEnum.iniciado,
        json_questionario={},
    )

    mock_repo.buscar = AsyncMock(return_value=questionario)

    response = await client.get("/questionario")

    assert response.status_code in [200, 422]


@pytest.mark.asyncio
async def test_atualizar_questionario(
    setup_questionario_router, async_db, sample_email
):
    """PUT grava as respostas e o status enviado pelo cliente"""
    app = setup_questionario_router
    async_db.add(
        Questionario(
            usuario_email=sample_email,
            status_questionario=StatusEnum.iniciado,
            json_questionario={},
            criado_por=sample_email,
        )
    )
    await async_db.commit()

    client = _cliente(app)

    payload = {
        "status_questionario": StatusEnum.pendente,
        "json_questionario": {"2": {"business_canvas": "Canvas"}},
    }
    response = await client.put("/questionario", json=payload)

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
async def test_buscar_sem_questionario_devolve_404(setup_questionario_router):
    """Contrato com o frontend: sem documento, GET devolve 404 (o `meu()` cria o plano)"""
    app = setup_questionario_router

    response = await _cliente(app).get("/questionario")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_criar_duas_vezes_da_409(setup_questionario_router):
    app = setup_questionario_router
    client = _cliente(app)
    payload = {"status_questionario": "pendente", "json_questionario": {}}

    assert (await client.post("/questionario", json=payload)).status_code == 200
    response = await client.post("/questionario", json=payload)

    assert response.status_code == 409
    assert response.json() == {
        "mensagem": "Questionario já existe. Não é possível criar um novo questionario."
    }


@pytest.mark.asyncio
async def test_atualizar_sem_questionario_da_404(setup_questionario_router):
    app = setup_questionario_router

    response = await _cliente(app).put(
        "/questionario", json={"status_questionario": "pendente"}
    )

    assert response.status_code == 404
    assert response.json() == {"mensagem": "Questionário não encontrado."}
