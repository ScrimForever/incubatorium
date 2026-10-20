from fastapi import APIRouter, Depends
from starlette.responses import JSONResponse, RedirectResponse

from src.auth.backend import (
    auth_backend,
    current_active_user,
    fastapi_users,
)
from src.domain.models.usuario import User
from src.domain.schemas.user_schema import UserCreate, UserRead, UserUpdate
from src.logger import logger
from src.routers.dependencias import get_ativacao_service
from src.services.usuarios.ativacao_service import AtivacaoService

router = APIRouter()

router.include_router(
    fastapi_users.get_auth_router(auth_backend), prefix="/auth/jwt", tags=["auth"]
)
router.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/auth",
    tags=["auth"],
)
router.include_router(
    fastapi_users.get_reset_password_router(), prefix="/auth", tags=["auth"]
)
router.include_router(
    fastapi_users.get_verify_router(UserRead), prefix="/auth", tags=["auth"]
)
router.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/users",
    tags=["users"],
)


@router.get("/authenticated-route")
async def authenticated_route(user: User = Depends(current_active_user)):
    return {"message": f"Hello {user.email}!"}


@router.get("/validar_email/{email}/{code}")
async def ativar_email(
    email: str,
    code: str,
    service: AtivacaoService = Depends(get_ativacao_service),
):
    if await service.ativar(email, code):
        logger.success(f"Usuário: {email}. Ativado com sucesso.")
        return RedirectResponse(url="http://localhost:3000/conta-ativada")
    logger.warning(f"Usuário: {email}. Não pode ser ativado.")
    return RedirectResponse(url="http://localhost:3000/nao-encontrado")


@router.post("/reenviar_codigo/{email}")
async def reenviar_codigo(
    email: str, service: AtivacaoService = Depends(get_ativacao_service)
):
    if not await service.reenviar_codigo(email):
        return JSONResponse(
            status_code=403, content={"mensagem": "Email ou Código Inválido."}
        )
    return JSONResponse(
        status_code=200, content={"mensagem": "Email enviado com sucesso."}
    )
