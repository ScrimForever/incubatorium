from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.logger import logger
from src.routers.arquivos.r_arquivos import ArquivosRouter
from src.routers.questionario.r_questionario import QuestionarioRouter
from src.routers.users.r_user import UserRouter
from src.routers.usuarios.r_usuarios import router as usuarios_router
from src.shared.handlers import registrar_handlers


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Iniciando aplicação...")
    await UserRouter(app).start_router()
    logger.info("Rotas de usuários configuradas")
    await QuestionarioRouter(app).iniciar()
    logger.info("Rotas de questionários configuradas")
    app.include_router(usuarios_router)
    logger.info("Rotas de usuários configuradas")
    await ArquivosRouter(app).iniciar()
    logger.info("Rotas de arquivos configuradas")
    logger.success("Aplicação iniciada com sucesso!")
    yield
    logger.info("Encerrando aplicação...")


app = FastAPI(lifespan=lifespan)
registrar_handlers(app)
