"""Uma linha de log por requisição: método, rota, status, duração, usuário logado e `trace_id`
(o mesmo do trace no Sentry, para seguir o caminho da requisição)."""

import time

import sentry_sdk
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
        trace_id = (
            sentry_sdk.get_current_scope().get_active_propagation_context().trace_id
            if sentry_sdk.is_initialized()
            else "-"
        )
        metodo, rota = scope["method"], scope["path"]
        nivel = "ERROR" if status >= 500 else "WARNING" if status >= 400 else "INFO"
        logger.bind(
            usuario=usuario,
            trace_id=trace_id,
            http_status=status,
            duracao_ms=round(ms, 1),
        ).log(
            nivel,
            f"{metodo} {rota} {status} {ms:.0f}ms usuario={usuario} trace_id={trace_id}",
        )
