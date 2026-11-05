"""Lembretes diários: incubados sem reserva no mês e resumo para os admins."""

from datetime import date, time, timedelta

import pytest

from src.domain.models.consultoria import ConsultoriaHorario, ConsultoriaJanela
from src.repository.consultoria import ConsultoriaRepository
from src.repository.usuarios import UsuariosRepository
from src.services.consultoria.lembrete_service import LembreteService
from src.shared.datas import hoje_local, para_utc


def _fim_da_agenda() -> date:
    """Dia 20 do mês que vem: sempre no futuro e com folga para os 5 dias de aviso."""
    return (hoje_local().replace(day=1) + timedelta(days=32)).replace(day=20)


@pytest.fixture
def service(async_db):
    return LembreteService(ConsultoriaRepository(async_db), UsuariosRepository(async_db))


@pytest.fixture
async def cenario(async_db, criar_usuario):
    """Consultor com 2 horários no dia 20; `ana` reservou o primeiro, `bia` não."""
    consultor = await criar_usuario("consultor", "cons@example.com")
    ana = await criar_usuario("incubado", "ana@example.com")
    bia = await criar_usuario("incubado", "bia@example.com")
    admin = await criar_usuario("admin", "adm@example.com")
    dia = _fim_da_agenda()
    janela = ConsultoriaJanela(
        consultor_email=consultor.email,
        data=dia,
        hora_inicio=time(10),
        hora_fim=time(12),
        duracao_minutos=60,
        criado_por=consultor.email,
    )
    janela.horarios = [
        ConsultoriaHorario(
            consultor_email=consultor.email,
            inicio=para_utc(dia, time(h)),
            fim=para_utc(dia, time(h + 1)),
        )
        for h in (10, 11)
    ]
    async_db.add(janela)
    await async_db.commit()
    return janela, ana, bia, admin


async def _reservar(async_db, janela, incubado, indice=0):
    janela.horarios[indice].incubado_email = incubado.email
    await async_db.commit()


@pytest.mark.asyncio
async def test_avisa_so_quem_nao_reservou_e_o_admin(async_db, service, cenario):
    janela, ana, bia, admin = cenario
    await _reservar(async_db, janela, ana)

    avisos = await service.lembretes_de_agendamento(janela.data - timedelta(days=5))

    assert {a.email for a in avisos} == {bia.email, admin.email}
    admin_aviso = next(a for a in avisos if a.email == admin.email)
    assert "bia@example.com" in admin_aviso.detalhe
    assert "ana@example.com" not in admin_aviso.detalhe


@pytest.mark.asyncio
async def test_repete_ate_o_ultimo_dia_e_nao_antes_dos_5_dias(service, cenario):
    janela, *_ = cenario

    assert await service.lembretes_de_agendamento(janela.data - timedelta(days=6)) == []
    assert await service.lembretes_de_agendamento(janela.data)
    assert await service.lembretes_de_agendamento(janela.data + timedelta(days=1)) == []


@pytest.mark.asyncio
async def test_sem_pendentes_ninguem_e_avisado(async_db, service, cenario):
    janela, ana, bia, _ = cenario
    await _reservar(async_db, janela, ana, 0)
    await _reservar(async_db, janela, bia, 1)

    # sem horário livre nem pendentes: nada a lembrar, nem para o admin
    assert await service.lembretes_de_agendamento(janela.data - timedelta(days=2)) == []


@pytest.mark.asyncio
async def test_consultor_e_lembrado_uma_vez_6h_antes(async_db, service, cenario):
    janela, ana, *_ = cenario
    await _reservar(async_db, janela, ana, 0)  # 10h do dia 20
    inicio = janela.horarios[0].inicio

    assert await service.lembretes_ao_consultor(inicio - timedelta(hours=7)) == []

    avisos = await service.lembretes_ao_consultor(inicio - timedelta(hours=5, minutes=50))
    assert [a.email for a in avisos] == ["cons@example.com"]
    assert "ana@example.com" in avisos[0].detalhe

    assert await service.lembretes_ao_consultor(inicio - timedelta(hours=5)) == []
