from fastapi import APIRouter, BackgroundTasks, Depends, Response

from src.domain.models.usuario import User
from src.domain.schemas.consultoria_schema import (
    AgendaInput,
    CancelamentoOutput,
    CancelarDiasInput,
    HorarioOutput,
    HorarioUpdate,
    JanelaOutput,
    JanelaUpdate,
)
from src.routers.dependencias import get_consultoria_service
from src.services.consultoria.consultoria_service import ConsultoriaService
from src.shared.permissoes import agendador_consultoria, gestor_agenda

router = APIRouter(prefix="/consultorias", tags=["consultorias"])


# --- consultor ---------------------------------------------------------------------


@router.post("/agenda", response_model=list[JanelaOutput], status_code=201)
async def abrir_agenda(
    entrada: AgendaInput,
    tarefas: BackgroundTasks,
    consultor: User = Depends(gestor_agenda),
    service: ConsultoriaService = Depends(get_consultoria_service),
):
    """Abre janelas (dias × blocos de horário) e avisa os incubados por e-mail."""
    janelas, avisos = await service.abrir_agenda(consultor, entrada)
    tarefas.add_task(service.enviar_avisos, avisos)
    return janelas


@router.get("/agenda/minha", response_model=list[JanelaOutput])
async def minha_agenda(
    consultor: User = Depends(gestor_agenda),
    service: ConsultoriaService = Depends(get_consultoria_service),
):
    return await service.agenda_do_consultor(consultor)


@router.patch("/janelas/{janela_id}", response_model=JanelaOutput)
async def editar_janela(
    janela_id: int,
    entrada: JanelaUpdate,
    consultor: User = Depends(gestor_agenda),
    service: ConsultoriaService = Depends(get_consultoria_service),
):
    return await service.editar_janela(consultor, janela_id, entrada)


@router.post("/janelas/cancelar", response_model=CancelamentoOutput)
async def cancelar_dias(
    entrada: CancelarDiasInput,
    tarefas: BackgroundTasks,
    consultor: User = Depends(gestor_agenda),
    service: ConsultoriaService = Depends(get_consultoria_service),
):
    """Cancela todas as janelas do consultor em um ou vários dias."""
    janelas, reservas, avisos = await service.cancelar_dias(consultor, entrada.datas)
    tarefas.add_task(service.enviar_avisos, avisos)
    return CancelamentoOutput(janelas_canceladas=janelas, reservas_canceladas=reservas)


@router.delete("/janelas/{janela_id}", response_model=CancelamentoOutput)
async def cancelar_janela(
    janela_id: int,
    tarefas: BackgroundTasks,
    consultor: User = Depends(gestor_agenda),
    service: ConsultoriaService = Depends(get_consultoria_service),
):
    janelas, reservas, avisos = await service.cancelar_janela(consultor, janela_id)
    tarefas.add_task(service.enviar_avisos, avisos)
    return CancelamentoOutput(janelas_canceladas=janelas, reservas_canceladas=reservas)


@router.patch("/horarios/{horario_id}", response_model=HorarioOutput)
async def editar_horario(
    horario_id: int,
    entrada: HorarioUpdate,
    tarefas: BackgroundTasks,
    consultor: User = Depends(gestor_agenda),
    service: ConsultoriaService = Depends(get_consultoria_service),
):
    horario, avisos = await service.editar_horario(consultor, horario_id, entrada)
    tarefas.add_task(service.enviar_avisos, avisos)
    return horario


@router.delete("/horarios/{horario_id}", status_code=204)
async def cancelar_horario(
    horario_id: int,
    tarefas: BackgroundTasks,
    consultor: User = Depends(gestor_agenda),
    service: ConsultoriaService = Depends(get_consultoria_service),
):
    avisos = await service.cancelar_horario(consultor, horario_id)
    tarefas.add_task(service.enviar_avisos, avisos)
    return Response(status_code=204)


# --- incubado ----------------------------------------------------------------------


@router.get("/horarios", response_model=list[HorarioOutput])
async def horarios_livres(
    consultor: str | None = None,
    _: User = Depends(agendador_consultoria),
    service: ConsultoriaService = Depends(get_consultoria_service),
):
    return await service.listar_livres(consultor)


@router.get("/minhas", response_model=list[HorarioOutput])
async def minhas_consultorias(
    incubado: User = Depends(agendador_consultoria),
    service: ConsultoriaService = Depends(get_consultoria_service),
):
    return await service.minhas(incubado)


@router.post("/horarios/{horario_id}/reservar", response_model=HorarioOutput)
async def reservar(
    horario_id: int,
    incubado: User = Depends(agendador_consultoria),
    service: ConsultoriaService = Depends(get_consultoria_service),
):
    return await service.reservar(incubado, horario_id)


@router.delete("/horarios/{horario_id}/reserva", status_code=204)
async def cancelar_reserva(
    horario_id: int,
    incubado: User = Depends(agendador_consultoria),
    service: ConsultoriaService = Depends(get_consultoria_service),
):
    await service.cancelar_reserva(incubado, horario_id)
    return Response(status_code=204)
