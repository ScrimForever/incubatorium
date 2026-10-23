"""Uma linha de log por requisição: método, rota, status, duração, usuário logado e `trace_id`
(o mesmo do trace no SigNoz, para seguir o caminho da requisição)."""

import time

from opentelemetry import trace
from src.logger import logger
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class LogRequisicaoMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        inicio = time.perf_counter()
        status = 500

        async def enviar(mensagem: Message) -> None:
            nonlocal status
            if mensagem["type"] == "http.response.start":
                status = mensagem["status"]
            await send(mensagem)

        try:
            await self.app(scope, receive, enviar)
        finally:
            self._registrar(scope, status, (time.perf_counter() - inicio) * 1000)

    @staticmethod
    def _registrar(scope: Scope, status: int, ms: float) -> None:
        usuario = scope.get("state", {}).get("usuario_email") or "anonimo"
        span = trace.get_current_span()
        contexto = span.get_span_context()
        trace_id = f"{contexto.trace_id:032x}" if contexto.is_valid else "-"
        if span.is_recording():
            span.set_attribute("enduser.id", usuario)
        metodo, rota = scope["method"], scope["path"]
        nivel = "ERROR" if status >= 500 else "WARNING" if status >= 400 else "INFO"
        logger.bind(
            usuario=usuario, trace_id=trace_id, http_status=status, duracao_ms=round(ms, 1)
        ).log(
            nivel,
            f"{metodo} {rota} {status} {ms:.0f}ms usuario={usuario} trace_id={trace_id}",
        )
