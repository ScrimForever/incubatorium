from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.infra.db import create_db_and_tables
from src.logger import logger
from src.routers.arquivos.r_arquivos import ArquivosRouter
from src.routers.questionario.r_questionario import QuestionarioRouter
from src.routers.users.r_user import UserRouter


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Iniciando aplicação...")
    await create_db_and_tables()
    logger.info("Banco de dados configurado")
    await UserRouter(app).start_router()
    logger.info("Rotas de usuários configuradas")
    await QuestionarioRouter(app).iniciar()
    logger.info("Rotas de questionários configuradas")
    await ArquivosRouter(app).iniciar()
    logger.info("Rotas de arquivos configuradas")
    logger.success("Aplicação iniciada com sucesso!")
    yield
    logger.info("Encerrando aplicação...")


app = FastAPI(lifespan=lifespan)
