"""Lembra os incubados que ainda não agendaram consultoria no mês (e avisa os admins).

Uso, a partir de `src/`:

    python -m src.scripts.lembrar_agendamentos                  # roda uma vez
    python -m src.scripts.lembrar_agendamentos --diario 13:00   # todo dia às 13h (Brasília)

Roda do 5º dia antes até o último dia da agenda de cada consultor no mês. Fica fora do
processo da API para não duplicar e-mails quando houver mais de uma réplica.
"""

import argparse
import asyncio
from datetime import datetime, time, timedelta

from src.infra.db import async_session_maker
from src.logger import logger
from src.repository.consultoria import ConsultoriaRepository
from src.repository.usuarios import UsuariosRepository
from src.services.consultoria.avisos import EnviadorDeAvisos
from src.services.consultoria.lembrete_service import LembreteService
from src.services.email.setup import EmailSetup
from src.shared.datas import FUSO, hoje_local


async def _main() -> None:
    async with async_session_maker() as session:
        service = LembreteService(
            ConsultoriaRepository(session), UsuariosRepository(session)
        )
        avisos = await service.lembretes_de_agendamento(hoje_local())
    await EnviadorDeAvisos(EmailSetup()).enviar(avisos)
    logger.info(f"{len(avisos)} lembrete(s) de agendamento enviado(s).")


def segundos_ate(hora: time, agora: datetime) -> float:
    """Segundos até a próxima ocorrência de `hora` (fuso da incubadora) depois de `agora`."""
    alvo = datetime.combine(agora.date(), hora, tzinfo=FUSO)
    if alvo <= agora:
        alvo += timedelta(days=1)
    return (alvo - agora).total_seconds()


async def _diario(hora: time) -> None:
    while True:
        await asyncio.sleep(segundos_ate(hora, datetime.now(FUSO)))
        try:
            await _main()
        except Exception as erro:  # noqa: BLE001  (uma falha não derruba o agendamento)
            logger.error(f"Falha nos lembretes de agendamento: {erro}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--diario", type=time.fromisoformat, metavar="HH:MM")
    args = parser.parse_args()
    asyncio.run(_diario(args.diario) if args.diario else _main())


if __name__ == "__main__":
    main()
