from datetime import datetime

from fastapi import APIRouter, Depends, Query

from src.domain.models.auditoria import EventoAcesso
from src.domain.models.usuario import User
from src.domain.schemas.auditoria_schema import RegistroAcessoRead
from src.routers.dependencias import get_auditoria_service
from src.services.auditoria.auditoria_service import AuditoriaService
from src.shared.permissoes import somente_admin

router = APIRouter(prefix="/auditoria", tags=["auditoria"])


@router.get("/acessos", response_model=list[RegistroAcessoRead])
async def historico_de_acessos(
    email: str | None = None,
    evento: EventoAcesso | None = None,
    desde: datetime | None = Query(None, description="Inclusivo."),
    ate: datetime | None = Query(None, description="Exclusivo."),
    limite: int = Query(100, ge=1, le=500),
    deslocamento: int = Query(0, ge=0),
    _: User = Depends(somente_admin),
    service: AuditoriaService = Depends(get_auditoria_service),
):
    """Logins (com e sem sucesso) e trocas de senha, mais recentes primeiro.

    Restrito a admins.
    """
    return await service.acessos(email, evento, desde, ate, limite, deslocamento)
