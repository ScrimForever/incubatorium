from fastapi import APIRouter, Depends

from src.domain.models.usuario import User
from src.domain.schemas.questionario_schema import (
    SelecaoAvaliadoresInput,
    SelecaoAvaliadoresOutput,
)
from src.routers.dependencias import get_selecao_avaliadores_service
from src.services.questionario.selecao_avaliadores_service import (
    SelecaoAvaliadoresService,
)
from src.shared.permissoes import gestor_incubados

router = APIRouter(tags=["questionario"])


@router.post(
    "/questionario-selecionado-avaliadores",
    status_code=201,
    response_model=SelecaoAvaliadoresOutput,
)
async def selecionar_avaliadores(
    corpo: SelecaoAvaliadoresInput,
    user: User = Depends(gestor_incubados),
    service: SelecaoAvaliadoresService = Depends(get_selecao_avaliadores_service),
):
    """Define os avaliadores (consultores) do questionário, substituindo a seleção anterior."""
    return await service.selecionar(user, corpo)
