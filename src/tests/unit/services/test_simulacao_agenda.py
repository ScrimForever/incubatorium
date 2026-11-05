"""Simulação ponta a ponta: agenda do consultor, disputa por horário, lembrete de 6h ao
consultor e lembretes de 5 dias a incubados sem reserva e ao admin.

Os e-mails vão para uma caixa de correio falsa (`Caixa`); rode com `-s` para vê-los.
"""

from datetime import date, time, timedelta

import pytest

from src.domain.schemas.consultoria_schema import AgendaInput, BlocoInput
from src.repository.consultoria import ConsultoriaRepository
from src.repository.usuarios import UsuariosRepository
from src.services.consultoria.agenda_service import AgendaService
from src.services.consultoria.avisos import EnviadorDeAvisos
from src.services.consultoria.convites import ConvitesPorEmail
from src.services.consultoria.lembrete_service import LembreteService
from src.services.consultoria.reserva_service import ReservaService
from src.shared.datas import hoje_local, para_utc
from src.shared.exceptions import ConflitoError


class Caixa:
    """Notificador falso: guarda tudo o que seria enviado por e-mail."""

    def __init__(self):
        self.emails = []

    async def enviar_notificacao(
        self, email, assunto, titulo, mensagem, detalhe="", convite_ics=""
    ):
        self.emails.append((email, assunto, detalhe, convite_ics))
        return True

    def para(self, email, assunto=None):
        return [
            e for e in self.emails if e[0] == email and assunto in (None, e[1])
        ]

    def limpar(self):
        self.emails.clear()

    def imprimir(self, titulo):
        print(f"\n=== {titulo} ===")
        for email, assunto, detalhe, ics in self.emails:
            anexo = " [+.ics]" if ics else ""
            print(f"  -> {email} | {assunto}{anexo}\n       {detalhe}")


def _dia(numero: int) -> date:
    """Dia `numero` do mês que vem: sempre futuro e dentro de um mesmo mês."""
    return (hoje_local().replace(day=1) + timedelta(days=32)).replace(day=numero)


@pytest.mark.asyncio
async def test_simulacao_agenda_reservas_e_lembretes(async_db, criar_usuario):
    caixa = Caixa()
    enviador = EnviadorDeAvisos(caixa)
    repo, usuarios = ConsultoriaRepository(async_db), UsuariosRepository(async_db)
    agenda = AgendaService(repo, usuarios, ConvitesPorEmail(enviador))
    reservas = ReservaService(repo, ConvitesPorEmail(enviador))
    lembretes = LembreteService(repo, usuarios)

    consultor = await criar_usuario("consultor", "cons@example.com")
    admin = await criar_usuario("admin", "adm@example.com")
    incubados = {
        nome: await criar_usuario("incubado", f"{nome}@example.com")
        for nome in ("ana", "bia", "carla", "davi")
    }
    await async_db.commit()
    ana, bia = incubados["ana"], incubados["bia"]

    # 1) Consultor abre agenda em dois dias (dia 18 e dia 20), 10h-12h de 1h.
    dia1, dia2 = _dia(18), _dia(20)
    entrada = AgendaInput(
        datas=[dia1, dia2],
        blocos=[BlocoInput(hora_inicio=time(10), hora_fim=time(12), duracao_minutos=60)],
    )
    janelas, avisos = await agenda.abrir_agenda(consultor, entrada)
    await enviador.enviar(avisos)
    caixa.imprimir("1) Consultor abriu agenda -> aviso a todos os incubados")
    assert len(janelas) == 2
    assert {e[0] for e in caixa.emails} == {f"{n}@example.com" for n in incubados}
    caixa.limpar()

    h_dia1_10 = janelas[0].horarios[0]
    h_dia2_10 = janelas[1].horarios[0]

    # 2) Ana reserva dia1 10h; Bia tenta o MESMO horário e é barrada.
    reservado = await reservas.reservar(ana, h_dia1_10.id)
    assert reservado.meet_link.startswith("https://meet.jit.si/tec-campos-")
    with pytest.raises(ConflitoError):
        await reservas.reservar(bia, h_dia1_10.id)
    assert h_dia1_10.incubado_email == ana.email  # Bia não sobrescreveu a Ana

    # 3) Bia reserva outro dia (dia2 10h): agora cada um tem a sua.
    await reservas.reservar(bia, h_dia2_10.id)
    assert h_dia2_10.incubado_email == bia.email
    caixa.imprimir("2/3) Convites .ics para consultor+incubado de cada reserva")
    assert len(caixa.para(consultor.email, "Consultoria agendada")) == 2
    assert all(e[3] for e in caixa.emails)  # todos com anexo .ics
    assert caixa.para(bia.email, "Consultoria agendada")[0][3] != ""
    caixa.limpar()

    # 4) Lembrete de 6h ao consultor, simulando o relógio.
    inicio1 = para_utc(dia1, time(10))
    fora = await lembretes.lembretes_ao_consultor(inicio1 - timedelta(hours=7))
    assert fora == []  # 7h antes: ainda cedo
    dentro = await lembretes.lembretes_ao_consultor(inicio1 - timedelta(hours=5, minutes=50))
    await enviador.enviar(dentro)
    caixa.imprimir("4) 'Faltam <6h' -> consultor lembrado da consulta da Ana")
    assert [a.email for a in dentro] == [consultor.email]
    assert ana.email in dentro[0].detalhe and bia.email not in dentro[0].detalhe
    # só uma vez, e a consulta da Bia (outro dia) não é puxada junto
    assert await lembretes.lembretes_ao_consultor(inicio1 - timedelta(hours=5)) == []
    caixa.limpar()
    inicio2 = para_utc(dia2, time(10))
    dentro2 = await lembretes.lembretes_ao_consultor(inicio2 - timedelta(hours=5))
    assert [a.email for a in dentro2] == [consultor.email]
    assert bia.email in dentro2[0].detalhe

    # 5) Faltando 5 dias para o fim da agenda: quem não reservou + admin.
    hoje_sim = dia2 - timedelta(days=5)
    avisos5 = await lembretes.lembretes_de_agendamento(hoje_sim)
    await enviador.enviar(avisos5)
    caixa.imprimir("5) D-5 do fim da agenda -> incubados pendentes e admin")
    assert {a.email for a in avisos5} == {
        "carla@example.com",
        "davi@example.com",
        admin.email,
    }
    detalhe_admin = next(a for a in avisos5 if a.email == admin.email).detalhe
    assert "carla@example.com" in detalhe_admin and "davi@example.com" in detalhe_admin
    assert "ana@example.com" not in detalhe_admin
    assert "bia@example.com" not in detalhe_admin
    # D-6: ainda não avisa; último dia: avisa; depois do fim: não avisa
    assert await lembretes.lembretes_de_agendamento(dia2 - timedelta(days=6)) == []
    assert await lembretes.lembretes_de_agendamento(dia2)
    assert await lembretes.lembretes_de_agendamento(dia2 + timedelta(days=1)) == []
