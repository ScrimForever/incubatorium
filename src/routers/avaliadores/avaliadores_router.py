from fastapi import APIRouter, Depends

from src.domain.models.usuario import User
from src.domain.schemas.user_schema import UserRead
from src.routers.dependencias import get_usuarios_service
from src.services.usuarios.usuarios_service import UsuariosService
from src.shared.permissoes import somente_admin

router = APIRouter(prefix="/avaliadores", tags=["avaliadores"])


@router.get("", response_model=list[UserRead])
async def listar_avaliadores(
    _: User = Depends(somente_admin),
    service: UsuariosService = Depends(get_usuarios_service),
):
    """Contas com perfil de consultor. Restrito a admins."""
    return await service.avaliadores()
