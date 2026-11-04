import calendar
from datetime import date, time, timedelta

from src.repository.consultoria import ConsultoriaRepository
from src.repository.usuarios import UsuariosRepository
from src.services.consultoria.avisos import Aviso
from src.shared.datas import agora, para_utc

# Quantos dias antes do fim da agenda do consultor os lembretes começam.
DIAS_DE_ANTECEDENCIA_LEMBRETE = 5


class LembreteService:
    """Lembretes diários de agendamento de consultoria."""

    def __init__(
        self, consultoria: ConsultoriaRepository, usuarios: UsuariosRepository
    ):
        self.consultoria = consultoria
        self.usuarios = usuarios

    async def lembretes_de_agendamento(self, hoje: date) -> list[Aviso]:
        """Lembretes diários para quem ainda não reservou com um consultor no mês.

        Vale do `DIAS_DE_ANTECEDENCIA_LEMBRETE`º dia antes até o último dia da agenda do
        consultor no mês. Cada incubado recebe um e-mail com os consultores pendentes; os
        admins recebem um e-mail com a lista de pendentes de cada consultor."""
        primeiro = hoje.replace(day=1)
        ultimo = hoje.replace(day=calendar.monthrange(hoje.year, hoje.month)[1])
        fins = await self.consultoria.fim_da_agenda_por_consultor(
            primeiro, ultimo, agora()
        )
        em_aviso = {
            consultor: fim
            for consultor, fim in sorted(fins.items())
            if 0 <= (fim - hoje).days <= DIAS_DE_ANTECEDENCIA_LEMBRETE
        }
        if not em_aviso:
            return []
        reservas = await self.consultoria.reservas_no_periodo(
            para_utc(primeiro, time.min), para_utc(ultimo + timedelta(days=1), time.min)
        )
        incubados = await self.usuarios.emails_incubados_ativos()
        pendentes = {
            consultor: [i for i in incubados if (consultor, i) not in reservas]
            for consultor in em_aviso
        }

        avisos = []
        for incubado in incubados:
            devidos = [c for c in em_aviso if incubado in pendentes[c]]
            if devidos:
                avisos.append(
                    Aviso(
                        email=incubado,
                        assunto="Agende sua consultoria",
                        titulo="Você ainda não agendou sua consultoria",
                        mensagem=(
                            "A agenda de consultoria deste mês está acabando e você ainda "
                            "não reservou um horário. Acesse a plataforma e agende."
                        ),
                        detalhe="; ".join(
                            f"Consultor: {c}, agenda até {em_aviso[c]:%d/%m/%Y}"
                            for c in devidos
                        ),
                    )
                )
        com_pendencia = [c for c in em_aviso if pendentes[c]]
        if com_pendencia:
            detalhe = " | ".join(
                f"Consultor {c} (agenda até {em_aviso[c]:%d/%m/%Y}), sem agendamento: "
                + ", ".join(pendentes[c])
                for c in com_pendencia
            )
            avisos += [
                Aviso(
                    email=admin,
                    assunto="Incubados sem agendamento de consultoria",
                    titulo="Incubados sem consultoria agendada no mês",
                    mensagem=(
                        "Estes incubados ainda não agendaram consultoria e a agenda do "
                        "consultor está perto do fim."
                    ),
                    detalhe=detalhe,
                )
                for admin in await self.usuarios.emails_admins_ativos()
            ]
        return avisos
