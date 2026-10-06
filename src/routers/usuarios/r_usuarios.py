from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.enums import SituacaoIncubacao
from src.domain.schemas.incubado_schema import (
    IncubadoResumo,
    SituacaoAlteradaOutput,
    SituacaoUpdate,
)
from src.domain.schemas.plano_schema import PlanoOutput
from src.infra.db import User, get_async_session
from src.services.usuarios.usuarios_service import UsuariosService
from src.shared.permissoes import exigir_acesso_incubado, exigir_colaborador

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


def _service(db: AsyncSession = Depends(get_async_session)) -> UsuariosService:
    return UsuariosService(db)


@router.get("", response_model=list[IncubadoResumo])
async def painel_de_incubados(
    perfil: Literal["incubado"] = "incubado",
    situacao: SituacaoIncubacao | None = None,
    _: User = Depends(exigir_colaborador),
    service: UsuariosService = Depends(_service),
):
    """Painel do colaborador: situação e estado do plano."""
    return await service.painel(situacao)


@router.patch("/{email}/situacao", response_model=SituacaoAlteradaOutput)
async def alterar_situacao(
    email: str,
    corpo: SituacaoUpdate,
    colaborador: User = Depends(exigir_colaborador),
    service: UsuariosService = Depends(_service),
):
    usuario = await service.alterar_situacao(colaborador, email, corpo.situacao)
    return SituacaoAlteradaOutput(
        email=usuario.email,
        situacao=usuario.situacao_incubacao,
        alterada_em=usuario.situacao_alterada_em,
        alterada_por=usuario.situacao_alterada_por,
    )


@router.get("/{email}/plano", response_model=PlanoOutput)
async def plano_do_incubado(
    alvo: User = Depends(exigir_acesso_incubado),
    service: UsuariosService = Depends(_service),
):
    """Questionário (plano de negócio) vigente do incubado."""
    return await service.plano(alvo.email)
