from src.domain.models.consultoria import ConsultoriaHorario
from src.domain.models.usuario import User
from src.logger import logger
from src.repository.consultoria import ConsultoriaRepository
from src.shared.datas import agora, como_utc
from src.shared.exceptions import (
    ConflitoError,
    NaoEncontradoError,
    ValidacaoNegocioError,
)


class ReservaService:
    """Reservas do incubado nos horários livres dos consultores."""

    def __init__(self, consultoria: ConsultoriaRepository):
        self.consultoria = consultoria

    async def listar_livres(
        self, consultor: str | None = None
    ) -> list[ConsultoriaHorario]:
        return await self.consultoria.listar_livres(agora(), consultor)

    async def minhas(self, incubado: User) -> list[ConsultoriaHorario]:
        return await self.consultoria.listar_do_incubado(incubado.email, agora())

    async def reservar(self, incubado: User, horario_id: int) -> ConsultoriaHorario:
        # Trava o incubado: duas reservas simultâneas dele passam uma de cada vez.
        await self.consultoria.travar_usuario(incubado.email)
        horario = await self.consultoria.buscar_horario(horario_id)
        if horario is None:
            raise NaoEncontradoError("Horário não encontrado.")
        if como_utc(horario.inicio) <= agora():
            raise ValidacaoNegocioError("Este horário já passou.")
        if await self.consultoria.horario_do_incubado_sobreposto(
            incubado.email, horario.inicio, horario.fim
        ):
            raise ConflitoError("Você já tem uma consultoria neste horário.")
        if not await self.consultoria.reservar(horario_id, incubado.email, agora()):
            raise ConflitoError("Este horário já foi reservado por outro incubado.")
        await self.consultoria.salvar()
        await self.consultoria.atualizar(horario)
        logger.info(f"{incubado.email} reservou o horário {horario_id}.")
        return horario

    async def cancelar_reserva(self, incubado: User, horario_id: int) -> None:
        await self.consultoria.travar_usuario(incubado.email)
        horario = await self.consultoria.buscar_horario(horario_id, para_atualizar=True)
        if horario is None or horario.incubado_email != incubado.email:
            raise NaoEncontradoError("Reserva não encontrada.")
        if como_utc(horario.inicio) <= agora():
            raise ValidacaoNegocioError("Esta consultoria já começou.")
        horario.incubado_email = None
        horario.reservado_em = None
        await self.consultoria.salvar()
