from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers.auth import router
from routers.dependencias import get_ativacao_service


@pytest.fixture
def servico():
    return AsyncMock()


@pytest.fixture
def client(servico):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_ativacao_service] = lambda: servico
    return TestClient(app, follow_redirects=False)


class TestAuthRouter:
    def test_authenticated_route_exige_login(self, client):
        assert client.get("/authenticated-route").status_code == 401

    def test_validar_email_sucesso(self, client, servico):
        servico.ativar.return_value = True

        response = client.get("/validar_email/a@b.com/123456")

        assert response.status_code == 307
        assert response.headers["location"] == "http://localhost:3000/conta-ativada"
        servico.ativar.assert_awaited_once_with("a@b.com", "123456")

    def test_validar_email_falha(self, client, servico):
        servico.ativar.return_value = False

        response = client.get("/validar_email/a@b.com/999999")

        assert response.status_code == 307
        assert response.headers["location"] == "http://localhost:3000/nao-encontrado"

    def test_reenviar_codigo_sucesso(self, client, servico):
        servico.reenviar_codigo.return_value = True

        response = client.post("/reenviar_codigo/a@b.com")

        assert response.status_code == 200
        assert response.json() == {"mensagem": "Email enviado com sucesso."}
        servico.reenviar_codigo.assert_awaited_once_with("a@b.com")

    def test_reenviar_codigo_falha(self, client, servico):
        servico.reenviar_codigo.return_value = False

        response = client.post("/reenviar_codigo/nao@existe.com")

        assert response.status_code == 403
        assert response.json() == {"mensagem": "Email ou Código Inválido."}
