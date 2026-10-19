from fastapi import APIRouter, Depends

from src.domain.models.usuario import User
from src.domain.schemas.questionario_schema import (
    QuestionarioInputSchema,
    QuestionarioOutputSchema,
)
from src.logger import logger
from src.routers.dependencias import get_questionario_service
from src.services.questionario.questionario_service import QuestionarioService
from src.shared.permissoes import avaliador_questionario, editor_questionario

router = APIRouter(prefix="/questionario", tags=["questionario"])


@router.post("", response_model=QuestionarioOutputSchema)
async def inserir_questionario(
    questionario: QuestionarioInputSchema,
    user: User = Depends(editor_questionario),
    service: QuestionarioService = Depends(get_questionario_service),
):
    logger.info(f"Gravando novo questionário para usuário: {user.email}")
    gravado = await service.criar(user, questionario)
    logger.success(f"Questionario gravado com sucesso para usuário: {user.email}")
    return gravado


@router.get("")
async def buscar_questionario(
    user: User = Depends(editor_questionario),
    service: QuestionarioService = Depends(get_questionario_service),
):
    return await service.buscar(user) or False


@router.put("", response_model=QuestionarioOutputSchema)
async def atualizar_questionario(
    questionario: QuestionarioInputSchema,
    user: User = Depends(editor_questionario),
    service: QuestionarioService = Depends(get_questionario_service),
):
    return await service.atualizar(user, questionario)


@router.get("/todos")
async def buscar_todos_questionarios(
    user: User = Depends(avaliador_questionario),
    service: QuestionarioService = Depends(get_questionario_service),
):
    return await service.listar_todos()
