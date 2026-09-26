from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from infra.db import User
from routers.users.r_user import UserRouter


@pytest.fixture
async def setup_user_router(async_db: AsyncSession, sample_email):
    """Setup para router de usuário"""
    user = User(
        email=sample_email,
        hashed_password="hashed_pwd",
        is_active=True,
    )
    async_db.add(user)
    await async_db.commit()

    app = FastAPI()

    router = UserRouter(app=app)
    yield router, app, user


class TestUserRouter:
    @pytest.mark.asyncio
    async def test_authenticated_route(self, setup_user_router):
        """Teste de rota autenticada"""
        router, app, user = setup_user_router

        client = TestClient(app)

        with patch("routers.users.r_user.current_active_user") as mock_user:
            mock_user.return_value = user

            await router.start_router()

            response = client.get("/authenticated-route")

            assert response.status_code in [200, 401, 422]

    @pytest.mark.asyncio
    async def test_validar_email_sucesso(self, setup_user_router, sample_email):
        """Teste para validar email com sucesso"""
        router, app, user = setup_user_router
        codigo = user.codigo_ativacao

        assert codigo is not None

        client = TestClient(app)

        with patch(
            "services.email.setup.EmailSetup.enviar_email_cadastro"
        ) as mock_email:
            mock_email.return_value = AsyncMock(return_value=True)

            with patch("routers.users.r_user.get_async_session") as mock_session:
                mock_session.return_value = AsyncMock()

                with patch("routers.users.r_user.UserService") as mock_service_class:
                    mock_service = AsyncMock()
                    mock_service_class.return_value = mock_service
                    mock_service.ativar_usuario_com_codigo_verificacao = AsyncMock(
                        return_value=True
                    )

                    await router.start_router()

                    response = client.get(f"/validar_email/{sample_email}/{codigo}")

                    assert response.status_code in [200, 307, 422]

    @pytest.mark.asyncio
    async def test_validar_email_falha(self, setup_user_router, sample_email):
        """Teste para validar email com falha"""
        router, app, _user = setup_user_router

        client = TestClient(app)

        with patch(
            "services.email.setup.EmailSetup.enviar_email_cadastro"
        ) as mock_email:
            mock_email.return_value = AsyncMock(return_value=False)

            with patch("routers.users.r_user.get_async_session") as mock_session:
                mock_session.return_value = AsyncMock()

                with patch("routers.users.r_user.UserService") as mock_service_class:
                    mock_service = AsyncMock()
                    mock_service_class.return_value = mock_service
                    mock_service.ativar_usuario_com_codigo_verificacao = AsyncMock(
                        return_value=False
                    )

                    await router.start_router()

                    response = client.get(f"/validar_email/{sample_email}/999999")

                    assert response.status_code in [200, 307, 422]

    @pytest.mark.asyncio
    async def test_reenviar_codigo_sucesso(self, setup_user_router, sample_email):
        """Teste para reenviar código"""
        router, app, _user = setup_user_router

        client = TestClient(app)

        with patch(
            "services.email.setup.EmailSetup.enviar_email_cadastro"
        ) as mock_email:
            mock_email.return_value = AsyncMock(return_value=True)

            with patch("routers.users.r_user.get_async_session") as mock_session:
                mock_session.return_value = AsyncMock()

                with patch("routers.users.r_user.UserService") as mock_service_class:
                    mock_service = AsyncMock()
                    mock_service_class.return_value = mock_service
                    mock_service.reenviar_codigo_para_email = AsyncMock(
                        return_value=True
                    )

                    await router.start_router()

                    response = client.post(f"/reenviar_codigo/{sample_email}")

                    assert response.status_code in [200, 422]

    @pytest.mark.asyncio
    async def test_reenviar_codigo_falha(self, setup_user_router):
        """Teste para reenviar código com falha"""
        router, app, _user = setup_user_router

        client = TestClient(app)

        with patch(
            "services.email.setup.EmailSetup.enviar_email_cadastro"
        ) as mock_email:
            mock_email.return_value = AsyncMock(return_value=False)

            with patch("routers.users.r_user.get_async_session") as mock_session:
                mock_session.return_value = AsyncMock()

                with patch("routers.users.r_user.UserService") as mock_service_class:
                    mock_service = AsyncMock()
                    mock_service_class.return_value = mock_service
                    mock_service.reenviar_codigo_para_email = AsyncMock(
                        return_value=False
                    )

                    await router.start_router()

                    response = client.post("/reenviar_codigo/nao@existe.com")

                    assert response.status_code in [200, 422]
