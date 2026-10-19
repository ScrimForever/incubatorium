from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.logger import logger
from src.routers import ROUTERS
from src.shared.handlers import registrar_handlers


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Iniciando aplicação...")
    yield
    logger.info("Encerrando aplicação...")


app = FastAPI(lifespan=lifespan)
registrar_handlers(app)
for router in ROUTERS:
    app.include_router(router)
