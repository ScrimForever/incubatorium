import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime

from src.domain.models.consultoria import ConsultoriaHorario
from src.services.consultoria.avisos import Aviso, EnviadorDeAvisos
from src.shared.datas import como_utc, formatar_local

SALA_BASE = "https://meet.jit.si/tec-campos-"


@dataclass(frozen=True)
class Reuniao:
    """Consultoria reservada, com a sala Jitsi e o UID do convite (o hash da sala)."""

    uid: str
    consultor: str
    incubado: str
    inicio: datetime
    fim: datetime

    @property
    def link(self) -> str:
        return SALA_BASE + self.uid


def nova_sala() -> str:
    """Hash SHA-512 de 32 bytes aleatórios: o link só é conhecido por quem recebe o convite."""
    return hashlib.sha512(secrets.token_bytes(32)).hexdigest()


def reuniao_do_horario(horario: ConsultoriaHorario) -> Reuniao | None:
    """`None` se o horário não tem reserva com sala."""
    if not (horario.incubado_email and horario.evento_id):
        return None
    return Reuniao(
        horario.evento_id,
        horario.consultor_email,
        horario.incubado_email,
        como_utc(horario.inicio),
        como_utc(horario.fim),
    )


def _data(momento: datetime) -> str:
    return momento.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def montar_ics(reuniao: Reuniao, metodo: str) -> str:
    """iCalendar (RFC 5545) do convite (`REQUEST`) ou do cancelamento (`CANCEL`).
    `SEQUENCE` cresce com o tempo, então reenviar com novo horário atualiza o evento."""
    agora = datetime.now(UTC)
    linhas = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Tec Campos//Consultoria//PT",
        f"METHOD:{metodo}",
        "BEGIN:VEVENT",
        f"UID:{reuniao.uid}@teccampos",
        f"DTSTAMP:{_data(agora)}",
        f"SEQUENCE:{int(agora.timestamp())}",
        f"DTSTART:{_data(reuniao.inicio)}",
        f"DTEND:{_data(reuniao.fim)}",
        "SUMMARY:Tec Campos - Consultoria",
        f"DESCRIPTION:Consultoria entre {reuniao.consultor} e {reuniao.incubado}.\\n"
        f"Sala: {reuniao.link}",
        f"LOCATION:{reuniao.link}",
        f"URL:{reuniao.link}",
        f"ORGANIZER:mailto:{reuniao.consultor}",
        f"ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:{reuniao.consultor}",
        f"ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:{reuniao.incubado}",
        f"STATUS:{'CANCELLED' if metodo == 'CANCEL' else 'CONFIRMED'}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(linhas) + "\r\n"


class ConvitesPorEmail:
    """Envia o .ics da consultoria ao consultor e ao incubado; o Gmail de cada um o
    mostra como convite e o coloca na agenda. Falhas de envio não afetam a reserva."""

    def __init__(self, enviador: EnviadorDeAvisos):
        self.enviador = enviador

    async def convidar(self, reuniao: Reuniao) -> None:
        await self._enviar(
            reuniao,
            "REQUEST",
            "Consultoria agendada",
            "Sua consultoria está marcada",
            "Adicione o convite em anexo à sua agenda e entre pela sala abaixo.",
        )

    async def cancelar(self, reuniao: Reuniao) -> None:
        await self._enviar(
            reuniao,
            "CANCEL",
            "Convite de consultoria cancelado",
            "A reunião foi cancelada",
            "Esta reunião foi cancelada e sai da sua agenda.",
        )

    async def _enviar(
        self, reuniao: Reuniao, metodo: str, assunto: str, titulo: str, mensagem: str
    ) -> None:
        ics = montar_ics(reuniao, metodo)
        detalhe = (
            f"Consultor: {reuniao.consultor}. Incubado: {reuniao.incubado}. "
            f"Horário: {formatar_local(reuniao.inicio)}. Sala: {reuniao.link}"
        )
        await self.enviador.enviar(
            [
                Aviso(email, assunto, titulo, mensagem, detalhe, ics)
                for email in (reuniao.consultor, reuniao.incubado)
            ]
        )
