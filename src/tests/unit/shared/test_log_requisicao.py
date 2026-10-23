from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from loguru import logger

from src.shared.log_requisicao import LogRequisicaoMiddleware


def _app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(LogRequisicaoMiddleware)

    @app.get("/logado")
    async def logado(request: Request):
        request.state.usuario_email = "ana@x.com"
        return {}

    @app.get("/anonimo")
    async def anonimo():
        return {}

    return app


def _capturar():
    mensagens: list[str] = []
    sink = logger.add(lambda m: mensagens.append(m.record["message"]), level="INFO")
    return mensagens, sink


def test_loga_usuario_logado_rota_e_status():
    mensagens, sink = _capturar()
    try:
        TestClient(_app()).get("/logado")
    finally:
        logger.remove(sink)

    assert any(
        m.startswith("GET /logado 200") and "usuario=ana@x.com" in m for m in mensagens
    )


def test_requisicao_sem_login_sai_como_anonimo_e_404_vira_warning():
    mensagens, sink = _capturar()
    try:
        client = TestClient(_app())
        client.get("/anonimo")
        client.get("/nao-existe")
    finally:
        logger.remove(sink)

    assert any("GET /anonimo 200" in m and "usuario=anonimo" in m for m in mensagens)
    assert any(m.startswith("GET /nao-existe 404") for m in mensagens)
