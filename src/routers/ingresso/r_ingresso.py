from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.questionarios.etapas import listar_etapas
from src.domain.models.questionarios.questionario import StatusEnum
from src.domain.models.user_model import current_active_user
from src.domain.schemas.ingresso_schema import (
    EtapaOutput,
    HistoricoQuestionarioOutput,
    PedidoOutput,
    RejeitarInput,
)
from src.domain.schemas.questionario_schema import QuestionarioOutputSchema
from src.infra.db import User, get_async_session
from src.services.ingresso.ingresso_service import IngressoService
from src.shared.permissoes import exigir_colaborador

router = APIRouter(tags=["ingresso"])


def _service(db: AsyncSession = Depends(get_async_session)) -> IngressoService:
    return IngressoService(db)


@router.post("/ingresso/enviar", response_model=QuestionarioOutputSchema)
async def enviar_para_analise(
    user: User = Depends(current_active_user),
    service: IngressoService = Depends(_service),
):
    return await service.enviar(user)


@router.post("/ingresso/reiniciar", response_model=QuestionarioOutputSchema)
async def reiniciar_questionario(
    user: User = Depends(current_active_user),
    service: IngressoService = Depends(_service),
):
    return await service.reiniciar(user)


@router.get("/ingresso", response_model=list[PedidoOutput])
async def listar_pedidos(
    status: StatusEnum | None = None,
    _: User = Depends(exigir_colaborador),
    service: IngressoService = Depends(_service),
):
    return await service.listar_pedidos(status)


@router.get(
    "/ingresso/{email}/historico", response_model=list[HistoricoQuestionarioOutput]
)
async def historico_do_candidato(
    email: str,
    user: User = Depends(current_active_user),
    service: IngressoService = Depends(_service),
):
    return await service.historico(user, email)


@router.post("/ingresso/{email}/aprovar", response_model=PedidoOutput)
async def aprovar_ingresso(
    email: str,
    colaborador: User = Depends(exigir_colaborador),
    service: IngressoService = Depends(_service),
):
    return await service.aprovar(colaborador, email)


@router.post("/ingresso/{email}/rejeitar", response_model=PedidoOutput)
async def rejeitar_ingresso(
    email: str,
    corpo: RejeitarInput,
    colaborador: User = Depends(exigir_colaborador),
    service: IngressoService = Depends(_service),
):
    return await service.rejeitar(colaborador, email, corpo.motivo)


@router.get("/etapas", response_model=list[EtapaOutput])
async def listar_etapas_questionario(_: User = Depends(current_active_user)):
    return [
        EtapaOutput(id=e.id, titulo=e.titulo, ordem=indice, avaliavel=e.avaliavel)
        for indice, e in enumerate(listar_etapas(), start=1)
    ]
