from fastapi import APIRouter

from src.routers import arquivos, auth, questionario, usuarios

ROUTERS: list[APIRouter] = [
    auth.router,
    usuarios.router,
    questionario.router,
    arquivos.router,
]
