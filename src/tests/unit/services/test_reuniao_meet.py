"""Reserva gera sala Jitsi e convite .ics; cancelar/remarcar o desfazem/atualizam."""

from datetime import UTC, date, datetime, time, timedelta

import pytest

from src.domain.models.consultoria import ConsultoriaHorario, ConsultoriaJanela
from src.repository.consultoria import ConsultoriaRepository
from src.services.consultoria.avisos import EnviadorDeAvisos
from src.services.consultoria.convites import (
    ConvitesPorEmail,
    Reuniao,
    montar_ics,
)
from src.services.consultoria.reserva_service import ReservaService
from src.shared.datas import hoje_local, para_utc


class ConvitesFalsos:
    def __init__(self):
        self.chamadas = []

    async def convidar(self, reuniao):
        self.chamadas.append(("convidar", reuniao))

    async def cancelar(self, reuniao):
        self.chamadas.append(("cancelar", reuniao))


async def _horario(async_db, criar_usuario):
    consultor = await criar_usuario("consultor", "cons@example.com")
    incubado = await criar_usuario("incubado", "ana@example.com")
    dia: date = hoje_local() + timedelta(days=3)
    janela = ConsultoriaJanela(
        consultor_email=consultor.email,
        data=dia,
        hora_inicio=time(10),
        hora_fim=time(11),
        duracao_minutos=60,
        criado_por=consultor.email,
    )
    janela.horarios = [
        ConsultoriaHorario(
            consultor_email=consultor.email,
            inicio=para_utc(dia, time(10)),
            fim=para_utc(dia, time(11)),
        )
    ]
    async_db.add(janela)
    await async_db.commit()
    return incubado, janela.horarios[0]


@pytest.mark.asyncio
async def test_reservar_gera_sala_jitsi_e_convida_e_cancelar_remove(
    async_db, criar_usuario
):
    incubado, horario = await _horario(async_db, criar_usuario)
    convites = ConvitesFalsos()
    service = ReservaService(ConsultoriaRepository(async_db), convites)

    reservado = await service.reservar(incubado, horario.id)

    hash_sala = reservado.evento_id
    assert len(hash_sala) == 128  # SHA-512 em hex
    assert reservado.meet_link == f"https://meet.jit.si/tec-campos-{hash_sala}"
    acao, reuniao = convites.chamadas[0]
    assert acao == "convidar"
    assert (reuniao.consultor, reuniao.incubado) == (
        "cons@example.com",
        "ana@example.com",
    )

    await service.cancelar_reserva(incubado, horario.id)
    assert convites.chamadas[-1] == ("cancelar", reuniao)
    assert reservado.meet_link is None and reservado.evento_id is None


def test_ics_traz_convite_para_os_dois_e_cancelamento():
    reuniao = Reuniao(
        "abc",
        "cons@example.com",
        "ana@example.com",
        datetime(2026, 11, 10, 13, 0, tzinfo=UTC),
        datetime(2026, 11, 10, 14, 0, tzinfo=UTC),
    )

    convite = montar_ics(reuniao, "REQUEST")
    assert "METHOD:REQUEST" in convite and "STATUS:CONFIRMED" in convite
    assert "UID:abc@teccampos" in convite
    assert "DTSTART:20261110T130000Z" in convite
    assert "LOCATION:https://meet.jit.si/tec-campos-abc" in convite
    assert "ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:ana@example.com" in convite
    assert "METHOD:CANCEL" in montar_ics(reuniao, "CANCEL")


@pytest.mark.asyncio
async def test_convite_vai_por_email_para_consultor_e_incubado():
    enviados = []

    class Notificador:
        async def enviar_notificacao(
            self, email, assunto, titulo, mensagem, detalhe="", convite_ics=""
        ):
            enviados.append((email, convite_ics))
            return True

    reuniao = Reuniao(
        "abc",
        "cons@example.com",
        "ana@example.com",
        datetime(2026, 11, 10, 13, 0, tzinfo=UTC),
        datetime(2026, 11, 10, 14, 0, tzinfo=UTC),
    )
    await ConvitesPorEmail(EnviadorDeAvisos(Notificador())).convidar(reuniao)

    assert [e for e, _ in enviados] == ["cons@example.com", "ana@example.com"]
    assert all("METHOD:REQUEST" in ics for _, ics in enviados)
