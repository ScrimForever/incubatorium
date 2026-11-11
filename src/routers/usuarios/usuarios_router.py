from typing import Literal

from fastapi import APIRouter, Depends

from src.domain.models.enums import SituacaoIncubacao
from src.domain.models.usuario import User
from src.domain.schemas.incubado_schema import (
    IncubadoResumo,
    SituacaoAlteradaOutput,
    SituacaoUpdate,
)
from src.domain.schemas.plano_schema import PlanoOutput
from src.domain.schemas.user_schema import (
    UserRead,
    UsuarioAdminRead,
    UsuarioCriar,
    UsuarioEditar,
)
from src.routers.dependencias import get_usuarios_service
from src.services.usuarios.usuarios_service import UsuariosService
from src.shared.permissoes import (
    exigir_acesso_incubado,
    gestor_incubados,
    somente_admin,
)

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


@router.post("", status_code=201, response_model=UserRead)
async def criar_usuario(
    corpo: UsuarioCriar,
    admin: User = Depends(somente_admin),
    service: UsuariosService = Depends(get_usuarios_service),
):
    """Cria conta ativa com um perfil. Restrito a admins."""
    return await service.criar(admin, corpo)


@router.get("/todos", response_model=list[UsuarioAdminRead])
async def listar_todos_usuarios(
    _: User = Depends(somente_admin),
    service: UsuariosService = Depends(get_usuarios_service),
):
    """Todas as contas, de qualquer perfil, com seus atributos. Restrito a admins."""
    return await service.todos()


@router.patch("/{email}", response_model=UsuarioAdminRead)
async def editar_usuario(
    email: str,
    corpo: UsuarioEditar,
    admin: User = Depends(somente_admin),
    service: UsuariosService = Depends(get_usuarios_service),
):
    """Edita dados, senha, status e perfil de uma conta. Restrito a admins."""
    return await service.editar(admin, email, corpo)


@router.get("", response_model=list[IncubadoResumo])
async def painel_de_incubados(
    perfil: Literal["incubado"] = "incubado",
    situacao: SituacaoIncubacao | None = None,
    _: User = Depends(gestor_incubados),
    service: UsuariosService = Depends(get_usuarios_service),
):
    """Painel do colaborador: situação e estado do plano."""
    return await service.painel(situacao)


@router.patch("/{email}/situacao", response_model=SituacaoAlteradaOutput)
async def alterar_situacao(
    email: str,
    corpo: SituacaoUpdate,
    colaborador: User = Depends(gestor_incubados),
    service: UsuariosService = Depends(get_usuarios_service),
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
    service: UsuariosService = Depends(get_usuarios_service),
):
    """Questionário (plano de negócio) vigente do incubado."""
    return await service.plano(alvo.email)
