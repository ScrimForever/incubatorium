from datetime import UTC, datetime


def agora() -> datetime:
    return datetime.now(UTC)
