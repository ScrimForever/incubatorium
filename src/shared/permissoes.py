"""Dependências FastAPI de autorização por perfil.

Perfis são flags em `User`: `is_admin`, `is_colaborador`, `is_consultor`, `is_incubado`.
"""

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from src.auth.backend import current_active_user
from src.domain.models.usuario import User
from src.infra.db import get_async_session
from src.repository.usuarios import UsuariosRepository


def _negar(detalhe: str = "Sem permissão para esta operação.") -> HTTPException:
    return HTTPException(status_code=403, detail=detalhe)


PERFIS = ("admin", "colaborador", "consultor", "incubado")


def exigir_perfil(*perfis: str):
    """Dependência que libera a rota a quem tem ao menos uma flag `is_<perfil>`.

    `is_admin` passa em qualquer rota. Perfil desconhecido falha ao definir a rota.
    """
    desconhecidos = set(perfis) - set(PERFIS)
    if desconhecidos:
        raise ValueError(f"Perfil(is) desconhecido(s): {sorted(desconhecidos)}")
    aceitos = {"admin", *perfis}

    async def dependencia(user: User = Depends(current_active_user)) -> User:
        if not any(getattr(user, f"is_{perfil}", False) for perfil in aceitos):
            raise _negar()
        return user

    return dependencia


# Políticas nomeadas: cada uma lista as flags `is_<perfil>` que liberam a rota
# (basta uma ser True; `is_admin` sempre passa). Uso: `Depends(visualizador_questionario)`.
visualizador_questionario = exigir_perfil("incubado", "colaborador", "consultor")
editor_questionario = exigir_perfil("incubado")
avaliador_questionario = exigir_perfil("colaborador", "consultor")
enviador_arquivos = exigir_perfil("incubado", "consultor")
gestor_incubados = exigir_perfil("colaborador")


async def pode_acessar_incubado(db: AsyncSession, user: User, email: str) -> bool:
    """Próprio incubado, qualquer colaborador, consultor ou admin."""
    return user.email == email or any(
        (user.is_admin, user.is_colaborador, user.is_consultor)
    )


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
