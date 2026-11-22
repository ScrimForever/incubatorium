from datetime import datetime

from sqlalchemy import select
from src.domain.models.auditoria import EventoAcesso, MotivoAcesso, RegistroAcesso
from src.domain.models.usuario import User
from src.domain.schemas.auditoria_schema import OrigemRequisicao
from src.repository.base import Repositorio


class AuditoriaRepository(Repositorio):
    """Histórico de acesso. Só insere e consulta: registros não mudam nem somem."""

    def registrar(
        self,
        evento: EventoAcesso,
        email: str,
        origem: OrigemRequisicao,
        *,
        usuario: User | None = None,
        motivo: MotivoAcesso | None = None,
        autor_email: str | None = None,
    ) -> None:
        """Adiciona o registro à sessão. Não confirma: quem chama salva."""
        self.db.add(
            RegistroAcesso(
                evento=evento,
                motivo=motivo,
                email=email[:320],
                usuario_id=None if usuario is None else usuario.id,
                autor_email=autor_email,
                ip=origem.ip,
                user_agent=origem.user_agent,
            )
        )

    async def listar(
        self,
        email: str | None = None,
        evento: EventoAcesso | None = None,
        desde: datetime | None = None,
        ate: datetime | None = None,
        limite: int | None = 100,
        deslocamento: int = 0,
    ) -> list[RegistroAcesso]:
        """Mais recentes primeiro. `limite=None` traz todos."""
        consulta = select(RegistroAcesso)
        if email is not None:
            consulta = consulta.where(RegistroAcesso.email == email)
        if evento is not None:
            consulta = consulta.where(RegistroAcesso.evento == evento)
        if desde is not None:
            consulta = consulta.where(RegistroAcesso.criado_em >= desde)
        if ate is not None:
            consulta = consulta.where(RegistroAcesso.criado_em < ate)
        consulta = (
            consulta.order_by(RegistroAcesso.criado_em.desc(), RegistroAcesso.id.desc())
            .limit(limite)
            .offset(deslocamento)
        )
        return list((await self.db.execute(consulta)).scalars().all())
