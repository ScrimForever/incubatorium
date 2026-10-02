import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from shared.exceptions import (
    ConflitoError,
    EtapaInvalidaError,
    MotivoObrigatorioError,
    NaoEncontradoError,
    PedidoJaDecididoError,
    SemPermissaoError,
)
from shared.handlers import registrar_handlers


@pytest.mark.parametrize(
    ("erro", "status"),
    [
        (NaoEncontradoError(), 404),
        (SemPermissaoError(), 403),
        (ConflitoError(), 409),
        (PedidoJaDecididoError(), 409),
        (MotivoObrigatorioError(), 422),
        (EtapaInvalidaError(99), 422),
    ],
)
def test_erro_de_negocio_vira_json_com_codigo_correto(erro, status):
    app = FastAPI()
    registrar_handlers(app)

    @app.get("/erro")
    async def _rota():
        raise erro

    resposta = TestClient(app).get("/erro")

    assert resposta.status_code == status
    assert resposta.json() == {"mensagem": str(erro)}
