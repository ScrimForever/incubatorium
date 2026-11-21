from datetime import datetime

from src.domain.models.auditoria import EventoAcesso, RegistroAcesso
from src.repository.auditoria import AuditoriaRepository
from src.services.auditoria.relatorio_pdf import (
    gerar_pdf_acessos_falha,
    gerar_pdf_acessos_sucesso,
)
from src.shared.datas import agora


class AuditoriaService:
    """Consulta do histórico de acesso (logins e trocas de senha)."""

    def __init__(self, auditoria: AuditoriaRepository):
        self.auditoria = auditoria

    async def acessos(
        self,
        email: str | None = None,
        evento: EventoAcesso | None = None,
        desde: datetime | None = None,
        ate: datetime | None = None,
        limite: int = 100,
        deslocamento: int = 0,
    ) -> list[RegistroAcesso]:
        return await self.auditoria.listar(
            email, evento, desde, ate, limite, deslocamento
        )

    async def relatorio_acessos_falha(self, gerado_por: str) -> bytes:
        """PDF com todas as tentativas de login recusadas, mais recentes primeiro."""
        registros = await self.auditoria.listar(
            evento=EventoAcesso.login_falha, limite=None
        )
        return gerar_pdf_acessos_falha(registros, gerado_por, agora())

    async def relatorio_acessos_sucesso(self, gerado_por: str) -> bytes:
        """PDF com todos os logins aceitos, mais recentes primeiro."""
        registros = await self.auditoria.listar(
            evento=EventoAcesso.login_sucesso, limite=None
        )
        return gerar_pdf_acessos_sucesso(registros, gerado_por, agora())
