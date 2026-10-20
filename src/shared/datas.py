from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

FUSO = ZoneInfo("America/Sao_Paulo")


def agora() -> datetime:
    return datetime.now(UTC)


def hoje_local() -> date:
    return datetime.now(FUSO).date()


def para_utc(dia: date, hora: time) -> datetime:
    """Data e hora de parede no fuso da incubadora, convertidas para UTC."""
    return datetime.combine(dia, hora, tzinfo=FUSO).astimezone(UTC)


def como_utc(momento: datetime) -> datetime:
    """Bancos sem fuso (SQLite nos testes) devolvem datetimes ingênuos: eram UTC."""
    return momento.replace(tzinfo=UTC) if momento.tzinfo is None else momento


def formatar_local(momento: datetime) -> str:
    return como_utc(momento).astimezone(FUSO).strftime("%d/%m/%Y %H:%M")
