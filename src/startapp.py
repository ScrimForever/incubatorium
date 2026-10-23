from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.infra.config import settings
from src.infra.db import engine
from src.infra.observabilidade import configurar_observabilidade
from src.logger import logger
from src.routers import ROUTERS
from src.shared.handlers import registrar_handlers
from src.shared.log_requisicao import LogRequisicaoMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Iniciando aplicação...")
    yield
    logger.info("Encerrando aplicação...")


app = FastAPI(lifespan=lifespan)
registrar_handlers(app)
# antes da observabilidade: o middleware do OpenTelemetry precisa ficar por fora para o span existir aqui
app.add_middleware(LogRequisicaoMiddleware)
configurar_observabilidade(app, engine, settings)
for router in ROUTERS:
    app.include_router(router)
