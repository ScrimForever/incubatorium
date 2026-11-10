from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.infra.armazenamento import ArmazenamentoLocal
from src.infra.db import get_async_session
from src.repository.consultoria import ConsultoriaRepository
from src.repository.questionario import QuestionarioRepository
from src.repository.usuarios import UsuariosRepository
from src.services.arquivos.arquivos_service import ArquivosService
from src.services.consultoria.agenda_service import AgendaService
from src.services.consultoria.avisos import EnviadorDeAvisos
from src.services.consultoria.convites import ConvitesPorEmail
from src.services.consultoria.reserva_service import ReservaService
from src.services.email.setup import EmailSetup
from src.services.questionario.questionario_service import QuestionarioService
from src.services.questionario.selecao_avaliadores_service import (
    SelecaoAvaliadoresService,
)
from src.services.usuarios.ativacao_service import AtivacaoService
from src.services.usuarios.usuarios_service import UsuariosService


def get_questionario_service(
    db: AsyncSession = Depends(get_async_session),
) -> QuestionarioService:
    return QuestionarioService(QuestionarioRepository(db))


def get_selecao_avaliadores_service(
    db: AsyncSession = Depends(get_async_session),
) -> SelecaoAvaliadoresService:
    return SelecaoAvaliadoresService(QuestionarioRepository(db), UsuariosRepository(db))


def get_usuarios_service(
    db: AsyncSession = Depends(get_async_session),
) -> UsuariosService:
    return UsuariosService(UsuariosRepository(db), QuestionarioRepository(db))


def get_ativacao_service(
    db: AsyncSession = Depends(get_async_session),
) -> AtivacaoService:
    return AtivacaoService(
        UsuariosRepository(db), QuestionarioRepository(db), EmailSetup()
    )


def get_armazenamento() -> ArmazenamentoLocal:
    return ArmazenamentoLocal()


def get_arquivos_service(
    db: AsyncSession = Depends(get_async_session),
    armazenamento: ArmazenamentoLocal = Depends(get_armazenamento),
) -> ArquivosService:
    return ArquivosService(QuestionarioRepository(db), armazenamento)


def get_agenda_service(
    db: AsyncSession = Depends(get_async_session),
) -> AgendaService:
    return AgendaService(
        ConsultoriaRepository(db), UsuariosRepository(db), get_convites()
    )


def get_reserva_service(
    db: AsyncSession = Depends(get_async_session),
) -> ReservaService:
    return ReservaService(ConsultoriaRepository(db), get_convites())


def get_enviador_de_avisos() -> EnviadorDeAvisos:
    return EnviadorDeAvisos(EmailSetup())


def get_convites() -> ConvitesPorEmail:
    return ConvitesPorEmail(get_enviador_de_avisos())
