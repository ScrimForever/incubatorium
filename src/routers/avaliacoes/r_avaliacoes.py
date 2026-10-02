from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.user_model import current_active_user
from src.domain.schemas.avaliacao_schema import AvaliacaoInput, AvaliacaoOutput
from src.infra.db import User, get_async_session
from src.services.avaliacoes.avaliacoes_service import AvaliacoesService
from src.shared.permissoes import exigir_consultor

router = APIRouter(tags=["avaliacoes"])


def _service(db: AsyncSession = Depends(get_async_session)) -> AvaliacoesService:
    return AvaliacoesService(db)


@router.put("/usuarios/{email}/avaliacoes/{etapa_id}", response_model=AvaliacaoOutput)
async def avaliar_etapa(
    email: str,
    etapa_id: int,
    dados: AvaliacaoInput,
    consultor: User = Depends(exigir_consultor),
    service: AvaliacoesService = Depends(_service),
):
    return await service.avaliar(consultor, email, etapa_id, dados)


@router.get("/usuarios/{email}/avaliacoes", response_model=list[AvaliacaoOutput])
async def listar_avaliacoes(
    email: str,
    user: User = Depends(current_active_user),
    service: AvaliacoesService = Depends(_service),
):
    return await service.listar(user, email)
