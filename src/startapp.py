from contextlib import asynccontextmanager

from fastapi import FastAPI

from infra.db import create_db_and_tables
from routers.users.r_user import UserRouter


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_db_and_tables()
    yield


app = FastAPI(lifespan=lifespan)

UserRouter(app).start_router()
