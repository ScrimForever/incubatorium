from fastapi import APIRouter

from src.routers import arquivos, auth, consultoria, questionario, usuarios

ROUTERS: list[APIRouter] = [
    auth.router,
    usuarios.router,
    questionario.router,
    arquivos.router,
    consultoria.router,
]
