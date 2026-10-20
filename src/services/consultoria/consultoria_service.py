from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from src.domain.models.consultoria import ConsultoriaHorario, ConsultoriaJanela
from src.domain.models.usuario import User
from src.domain.schemas.consultoria_schema import (
    AgendaInput,
    BlocoInput,
    HorarioUpdate,
    JanelaUpdate,
)
from src.logger import logger
from src.repository.consultoria import ConsultoriaRepository
from src.repository.usuarios import UsuariosRepository
from src.services.email.setup import EmailSetup
from src.shared.datas import agora, como_utc, formatar_local, hoje_local, para_utc
from src.shared.exceptions import (
    ConflitoError,
    NaoEncontradoError,
    ValidacaoNegocioError,
)


@dataclass(frozen=True)
class Aviso:
    """E-mail já montado: pode ser enviado depois do commit, sem tocar no banco."""

    email: str
    assunto: str
    titulo: str
    mensagem: str
    detalhe: str = ""


def _minutos(inicio: time, fim: time) -> int:
    return (fim.hour - inicio.hour) * 60 + (fim.minute - inicio.minute)


def _fatiar(
    dia: date, inicio: time, fim: time, duracao: int
) -> list[tuple[datetime, datetime]]:
    """Horários consecutivos de `duracao` minutos dentro de [inicio, fim]; a sobra final
    menor que a duração é descartada."""
    limite = para_utc(dia, fim)
    passo = timedelta(minutes=duracao)
    atual = para_utc(dia, inicio)
    fatias = []
    while atual + passo <= limite:
        fatias.append((atual, atual + passo))
        atual += passo
    return fatias


class ConsultoriaService:
    def __init__(
        self,
        consultoria: ConsultoriaRepository,
        usuarios: UsuariosRepository,
        email: EmailSetup,
    ):
        self.consultoria = consultoria
        self.usuarios = usuarios
        self.email = email

    # --- e-mail --------------------------------------------------------------------

    async def enviar_avisos(self, avisos: list[Aviso]) -> None:
        """Um destinatário com falha não impede os demais."""
        for aviso in avisos:
            try:
                await self.email.enviar_notificacao(
                    aviso.email,
                    aviso.assunto,
                    aviso.titulo,
                    aviso.mensagem,
                    aviso.detalhe,
                )
            except Exception as erro:  # noqa: BLE001
                logger.error(f"Falha ao avisar {aviso.email}: {erro}")

    @staticmethod
    def _aviso_horario(
        horario: ConsultoriaHorario, assunto: str, titulo: str, mensagem: str
    ) -> Aviso:
        return Aviso(
            email=horario.incubado_email,
            assunto=assunto,
            titulo=titulo,
            mensagem=mensagem,
            detalhe=(
                f"Consultor: {horario.consultor_email}. "
                f"Horário: {formatar_local(horario.inicio)}."
            ),
        )

    # --- consultor: janelas ----------------------------------------------------------

    async def abrir_agenda(
        self, consultor: User, entrada: AgendaInput
    ) -> tuple[list[ConsultoriaJanela], list[Aviso]]:
        for dia in entrada.datas:
            for bloco in entrada.blocos:
                if para_utc(dia, bloco.hora_inicio) <= agora():
                    raise ValidacaoNegocioError(
                        f"{dia:%d/%m/%Y} {bloco.hora_inicio:%H:%M} já passou."
                    )
        await self.consultoria.travar_usuario(consultor.email)
        janelas = []
        for dia in sorted(entrada.datas):
            for bloco in sorted(entrada.blocos, key=lambda b: b.hora_inicio):
                if await self.consultoria.janela_sobreposta(
                    consultor.email, dia, bloco.hora_inicio, bloco.hora_fim
                ):
                    raise ConflitoError(
                        f"Você já tem agenda aberta em {dia:%d/%m/%Y} que se sobrepõe a "
                        f"{bloco.hora_inicio:%H:%M}–{bloco.hora_fim:%H:%M}."
                    )
                janela = self._nova_janela(consultor, dia, bloco)
                self.consultoria.adicionar_janela(janela)
                janelas.append(janela)
        await self.consultoria.salvar()
        logger.info(f"{consultor.email} abriu {len(janelas)} janela(s) de consultoria.")
        return janelas, await self._avisos_agenda_aberta(consultor, janelas)

    @staticmethod
    def _nova_janela(
        consultor: User, dia: date, bloco: BlocoInput
    ) -> ConsultoriaJanela:
        janela = ConsultoriaJanela(
            consultor_email=consultor.email,
            data=dia,
            hora_inicio=bloco.hora_inicio,
            hora_fim=bloco.hora_fim,
            duracao_minutos=bloco.duracao_minutos,
            criado_por=consultor.email,
        )
        janela.horarios = [
            ConsultoriaHorario(consultor_email=consultor.email, inicio=i, fim=f)
            for i, f in _fatiar(
                dia, bloco.hora_inicio, bloco.hora_fim, bloco.duracao_minutos
            )
        ]
        return janela

    async def _avisos_agenda_aberta(
        self, consultor: User, janelas: list[ConsultoriaJanela]
    ) -> list[Aviso]:
        por_dia: dict[date, list[str]] = {}
        for janela in janelas:
            por_dia.setdefault(janela.data, []).append(
                f"{janela.hora_inicio:%H:%M}–{janela.hora_fim:%H:%M}"
            )
        detalhe = f"Consultor: {consultor.email}. " + "; ".join(
            f"{dia:%d/%m/%Y}: {', '.join(faixas)}" for dia, faixas in por_dia.items()
        )
        return [
            Aviso(
                email=destino,
                assunto="Nova agenda de consultoria",
                titulo="Há consultorias disponíveis",
                mensagem="Um consultor abriu horários. Acesse a plataforma para reservar o seu.",
                detalhe=detalhe,
            )
            for destino in await self.usuarios.emails_incubados_ativos()
        ]

    async def agenda_do_consultor(self, consultor: User) -> list[ConsultoriaJanela]:
        return await self.consultoria.janelas_a_partir_de(consultor.email, hoje_local())

    async def editar_janela(
        self, consultor: User, janela_id: int, entrada: JanelaUpdate
    ) -> ConsultoriaJanela:
        await self.consultoria.travar_usuario(consultor.email)
        janela = await self._janela_do_consultor(consultor, janela_id)
        inicio = entrada.hora_inicio or janela.hora_inicio
        fim = entrada.hora_fim or janela.hora_fim
        duracao = entrada.duracao_minutos or janela.duracao_minutos
        minutos = _minutos(inicio, fim)
        if minutos <= 0:
            raise ValidacaoNegocioError("hora_fim deve ser maior que hora_inicio.")
        if duracao > minutos:
            raise ValidacaoNegocioError("A duração não cabe no intervalo informado.")
        if para_utc(janela.data, fim) <= agora():
            raise ValidacaoNegocioError(
                "Não é possível editar uma janela que já passou."
            )
        if await self.consultoria.janela_sobreposta(
            consultor.email, janela.data, inicio, fim, ignorar_id=janela.id
        ):
            raise ConflitoError(
                "A nova faixa se sobrepõe a outra janela sua no mesmo dia."
            )

        limite_ini, limite_fim = (
            para_utc(janela.data, inicio),
            para_utc(janela.data, fim),
        )
        reservados = [h for h in janela.horarios if h.incubado_email]
        fora = [
            formatar_local(h.inicio)
            for h in reservados
            if como_utc(h.inicio) < limite_ini or como_utc(h.fim) > limite_fim
        ]
        if fora:
            raise ConflitoError(
                "Há horários reservados fora da nova faixa: " + ", ".join(fora) + "."
            )

        await self.consultoria.descartar_horarios(
            janela, [h for h in janela.horarios if not h.incubado_email]
        )
        for i, f in _fatiar(janela.data, inicio, fim, duracao):
            if not any(
                i < como_utc(h.fim) and f > como_utc(h.inicio) for h in reservados
            ):
                janela.horarios.append(
                    ConsultoriaHorario(consultor_email=consultor.email, inicio=i, fim=f)
                )
        janela.hora_inicio, janela.hora_fim, janela.duracao_minutos = (
            inicio,
            fim,
            duracao,
        )
        janela.atualizado_por = consultor.email
        janela.atualizado_em = agora()
        janela.horarios.sort(key=lambda h: como_utc(h.inicio))
        await self.consultoria.salvar()
        return janela

    async def cancelar_janela(
        self, consultor: User, janela_id: int
    ) -> tuple[int, int, list[Aviso]]:
        await self.consultoria.travar_usuario(consultor.email)
        janela = await self._janela_do_consultor(consultor, janela_id)
        return await self._cancelar([janela])

    async def cancelar_dias(
        self, consultor: User, datas: list[date]
    ) -> tuple[int, int, list[Aviso]]:
        await self.consultoria.travar_usuario(consultor.email)
        janelas = await self.consultoria.janelas_nas_datas(consultor.email, datas)
        if not janelas:
            raise NaoEncontradoError("Nenhuma janela sua nas datas informadas.")
        return await self._cancelar(janelas)

    async def _cancelar(
        self, janelas: list[ConsultoriaJanela]
    ) -> tuple[int, int, list[Aviso]]:
        avisos = [
            self._aviso_horario(
                h,
                "Consultoria cancelada",
                "Sua consultoria foi cancelada",
                "O consultor cancelou o horário que você havia reservado.",
            )
            for janela in janelas
            for h in janela.horarios
            if h.incubado_email
        ]
        await self.consultoria.excluir_janelas(janelas)
        await self.consultoria.salvar()
        return len(janelas), len(avisos), avisos

    async def _janela_do_consultor(
        self, consultor: User, janela_id: int
    ) -> ConsultoriaJanela:
        janela = await self.consultoria.buscar_janela(janela_id, consultor.email)
        if janela is None:
            raise NaoEncontradoError("Janela não encontrada.")
        return janela

    # --- consultor: horários ---------------------------------------------------------

    async def editar_horario(
        self, consultor: User, horario_id: int, entrada: HorarioUpdate
    ) -> tuple[ConsultoriaHorario, list[Aviso]]:
        await self.consultoria.travar_usuario(consultor.email)
        horario = await self._horario_do_consultor(consultor, horario_id)
        janela = horario.janela
        if _minutos(entrada.hora_inicio, entrada.hora_fim) <= 0:
            raise ValidacaoNegocioError("hora_fim deve ser maior que hora_inicio.")
        if (
            entrada.hora_inicio < janela.hora_inicio
            or entrada.hora_fim > janela.hora_fim
        ):
            raise ValidacaoNegocioError(
                f"O horário deve ficar dentro da janela "
                f"{janela.hora_inicio:%H:%M}–{janela.hora_fim:%H:%M}."
            )
        inicio = para_utc(janela.data, entrada.hora_inicio)
        fim = para_utc(janela.data, entrada.hora_fim)
        if inicio <= agora():
            raise ValidacaoNegocioError(
                "Não é possível mover um horário para o passado."
            )
        if await self.consultoria.horario_do_consultor_sobreposto(
            consultor.email, inicio, fim, ignorar_id=horario.id
        ):
            raise ConflitoError("O novo horário se sobrepõe a outro seu.")

        avisos: list[Aviso] = []
        if horario.incubado_email:
            await self.consultoria.travar_usuario(horario.incubado_email)
            if await self.consultoria.horario_do_incubado_sobreposto(
                horario.incubado_email, inicio, fim, ignorar_id=horario.id
            ):
                raise ConflitoError(
                    "O incubado já tem outra consultoria no novo horário."
                )
        horario.inicio, horario.fim = inicio, fim
        if horario.incubado_email:
            avisos.append(
                self._aviso_horario(
                    horario,
                    "Consultoria remarcada",
                    "Sua consultoria mudou de horário",
                    "O consultor alterou o horário da sua consultoria.",
                )
            )
        await self.consultoria.salvar()
        return horario, avisos

    async def cancelar_horario(self, consultor: User, horario_id: int) -> list[Aviso]:
        await self.consultoria.travar_usuario(consultor.email)
        horario = await self._horario_do_consultor(consultor, horario_id)
        avisos = (
            [
                self._aviso_horario(
                    horario,
                    "Consultoria cancelada",
                    "Sua consultoria foi cancelada",
                    "O consultor cancelou o horário que você havia reservado.",
                )
            ]
            if horario.incubado_email
            else []
        )
        await self.consultoria.excluir_horario(horario)
        await self.consultoria.salvar()
        return avisos

    async def _horario_do_consultor(
        self, consultor: User, horario_id: int
    ) -> ConsultoriaHorario:
        horario = await self.consultoria.buscar_horario(horario_id)
        if horario is None or horario.consultor_email != consultor.email:
            raise NaoEncontradoError("Horário não encontrado.")
        return horario

    # --- incubado --------------------------------------------------------------------

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
        await self.consultoria.db.refresh(horario)
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
