"""Dependências FastAPI de autorização por perfil.

Perfis são flags em `User`: `is_admin`, `is_colaborador`, `is_consultor`, `is_incubado`.
"""

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.user_model import current_active_user
from src.infra.db import User, get_async_session
from src.repository.usuarios.usuarios_rep import UsuariosRepository


def _negar(detalhe: str = "Sem permissão para esta operação.") -> HTTPException:
    return HTTPException(status_code=403, detail=detalhe)


async def exigir_colaborador(user: User = Depends(current_active_user)) -> User:
    if not user.is_colaborador:
        raise _negar("Operação restrita a colaboradores da incubadora.")
    return user


async def exigir_consultor(user: User = Depends(current_active_user)) -> User:
    if not user.is_consultor:
        raise _negar("Operação restrita a consultores.")
    return user


async def pode_acessar_incubado(db: AsyncSession, user: User, email: str) -> bool:
    """Próprio incubado, qualquer colaborador ou qualquer consultor."""
    return user.email == email or bool(user.is_colaborador) or bool(user.is_consultor)


async def exigir_acesso_incubado(
    email: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
) -> User:
    """Libera o acesso aos dados do incubado `email` (parâmetro de rota).

    Permitido ao próprio incubado, a qualquer colaborador e a qualquer consultor.
    Devolve o usuário incubado alvo.
    """
    if not await pode_acessar_incubado(db, user, email):
        raise _negar()
    incubado = await UsuariosRepository(db).buscar_por_email(email)
    if incubado is None or not incubado.is_incubado:
        raise HTTPException(status_code=404, detail="Incubado não encontrado.")
    return incubado
