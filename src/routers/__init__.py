from fastapi import APIRouter

from src.routers import arquivos, auth, avaliadores, consultoria, questionario, usuarios

ROUTERS: list[APIRouter] = [
    auth.router,
    usuarios.router,
    questionario.router,
    arquivos.router,
    consultoria.router,
    avaliadores.router,
]
