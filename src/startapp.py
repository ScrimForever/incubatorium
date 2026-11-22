from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.infra.config import settings
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


# antes de criar o app: o SDK instrumenta FastAPI/Starlette na inicialização
configurar_observabilidade(settings)
app = FastAPI(lifespan=lifespan)
registrar_handlers(app)
app.add_middleware(LogRequisicaoMiddleware)
for router in ROUTERS:
    app.include_router(router)
