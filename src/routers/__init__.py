from fastapi import APIRouter

from src.routers import (
    arquivos,
    auditoria,
    auth,
    avaliadores,
    consultoria,
    questionario,
    relatorios,
    selecao_avaliadores,
    usuarios,
)

ROUTERS: list[APIRouter] = [
    auth.router,
    usuarios.router,
    questionario.router,
    arquivos.router,
    consultoria.router,
    avaliadores.router,
    selecao_avaliadores.router,
    auditoria.router,
    relatorios.router,
]
