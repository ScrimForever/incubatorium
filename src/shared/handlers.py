from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from src.shared.exceptions import NegocioError


async def _tratar_negocio(_: Request, exc: NegocioError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"mensagem": exc.mensagem})


def registrar_handlers(app: FastAPI) -> None:
    app.add_exception_handler(NegocioError, _tratar_negocio)  # type: ignore[arg-type]
