from contextlib import asynccontextmanager

from fastapi import FastAPI
from src.infra.db import create_db_and_tables
from src.routers.arquivos.r_arquivos import ArquivosRouter
from src.routers.questionario.r_questionario import QuestionarioRouter
from src.routers.users.r_user import UserRouter


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_db_and_tables()
    await UserRouter(app).start_router()
    await QuestionarioRouter(app).iniciar()
    await ArquivosRouter(app).iniciar()
    yield


app = FastAPI(lifespan=lifespan)
