from datetime import date, datetime, time

from sqlalchemy import select, update
from src.domain.models.consultoria import ConsultoriaHorario, ConsultoriaJanela
from src.domain.models.usuario import User
from src.repository.base import Repositorio


class ConsultoriaRepository(Repositorio):
    async def travar_usuario(self, email: str) -> None:
        """Serializa, até o fim da transação, quem altera a agenda/reservas deste usuário."""
        await self.db.execute(
            select(User.id).where(User.email == email).with_for_update()
        )

    # --- janelas -----------------------------------------------------------------

    async def janela_sobreposta(
        self,
        consultor: str,
        dia: date,
        inicio: time,
        fim: time,
        ignorar_id: int | None = None,
    ) -> bool:
        consulta = select(ConsultoriaJanela.id).where(
            ConsultoriaJanela.consultor_email == consultor,
            ConsultoriaJanela.data == dia,
            ConsultoriaJanela.hora_inicio < fim,
            ConsultoriaJanela.hora_fim > inicio,
        )
        if ignorar_id is not None:
            consulta = consulta.where(ConsultoriaJanela.id != ignorar_id)
        return (await self.db.execute(consulta.limit(1))).first() is not None

    def adicionar_janela(self, janela: ConsultoriaJanela) -> None:
        self.db.add(janela)

    async def buscar_janela(
        self, janela_id: int, consultor: str
    ) -> ConsultoriaJanela | None:
        resultado = await self.db.execute(
            select(ConsultoriaJanela).where(
                ConsultoriaJanela.id == janela_id,
                ConsultoriaJanela.consultor_email == consultor,
            )
        )
        return resultado.scalar_one_or_none()

    async def janelas_nas_datas(
        self, consultor: str, datas: list[date]
    ) -> list[ConsultoriaJanela]:
        resultado = await self.db.execute(
            select(ConsultoriaJanela).where(
                ConsultoriaJanela.consultor_email == consultor,
                ConsultoriaJanela.data.in_(datas),
            )
        )
        return list(resultado.scalars().all())

    async def janelas_a_partir_de(
        self, consultor: str, dia: date
    ) -> list[ConsultoriaJanela]:
        resultado = await self.db.execute(
            select(ConsultoriaJanela)
            .where(
                ConsultoriaJanela.consultor_email == consultor,
                ConsultoriaJanela.data >= dia,
            )
            .order_by(ConsultoriaJanela.data, ConsultoriaJanela.hora_inicio)
        )
        return list(resultado.scalars().all())

    async def excluir_janelas(self, janelas: list[ConsultoriaJanela]) -> None:
        for janela in janelas:
            await self.db.delete(janela)
        await self.db.flush()

    async def descartar_horarios(
        self, janela: ConsultoriaJanela, horarios: list[ConsultoriaHorario]
    ) -> None:
        """Remove os horários já na transação (antes de reinserir os mesmos instantes,
        pois o INSERT roda antes do DELETE e violaria `UNIQUE(consultor, inicio)`)."""
        for horario in horarios:
            janela.horarios.remove(horario)
        await self.db.flush()

    # --- horários ----------------------------------------------------------------

    async def buscar_horario(
        self, horario_id: int, para_atualizar: bool = False
    ) -> ConsultoriaHorario | None:
        consulta = select(ConsultoriaHorario).where(ConsultoriaHorario.id == horario_id)
        if para_atualizar:
            consulta = consulta.with_for_update()
        return (await self.db.execute(consulta)).scalar_one_or_none()

    async def horario_do_consultor_sobreposto(
        self,
        consultor: str,
        inicio: datetime,
        fim: datetime,
        ignorar_id: int | None = None,
    ) -> bool:
        return await self._sobreposto(
            ConsultoriaHorario.consultor_email == consultor, inicio, fim, ignorar_id
        )

    async def horario_do_incubado_sobreposto(
        self,
        incubado: str,
        inicio: datetime,
        fim: datetime,
        ignorar_id: int | None = None,
    ) -> bool:
        return await self._sobreposto(
            ConsultoriaHorario.incubado_email == incubado, inicio, fim, ignorar_id
        )

    async def _sobreposto(self, dono, inicio, fim, ignorar_id) -> bool:
        consulta = select(ConsultoriaHorario.id).where(
            dono, ConsultoriaHorario.inicio < fim, ConsultoriaHorario.fim > inicio
        )
        if ignorar_id is not None:
            consulta = consulta.where(ConsultoriaHorario.id != ignorar_id)
        return (await self.db.execute(consulta.limit(1))).first() is not None

    async def reservar(self, horario_id: int, incubado: str, quando: datetime) -> bool:
        """Reserva só se ainda estiver livre (atômico). `False` = outro incubado chegou antes."""
        resultado = await self.db.execute(
            update(ConsultoriaHorario)
            .where(
                ConsultoriaHorario.id == horario_id,
                ConsultoriaHorario.incubado_email.is_(None),
            )
            .values(incubado_email=incubado, reservado_em=quando)
        )
        return resultado.rowcount == 1

    async def excluir_horario(self, horario: ConsultoriaHorario) -> None:
        horario.janela.horarios.remove(horario)
        await self.db.flush()

    async def listar_livres(
        self, a_partir_de: datetime, consultor: str | None = None
    ) -> list[ConsultoriaHorario]:
        consulta = select(ConsultoriaHorario).where(
            ConsultoriaHorario.incubado_email.is_(None),
            ConsultoriaHorario.inicio > a_partir_de,
        )
        if consultor is not None:
            consulta = consulta.where(ConsultoriaHorario.consultor_email == consultor)
        resultado = await self.db.execute(
            consulta.order_by(
                ConsultoriaHorario.inicio, ConsultoriaHorario.consultor_email
            )
        )
        return list(resultado.scalars().all())

    async def listar_do_incubado(
        self, incubado: str, a_partir_de: datetime
    ) -> list[ConsultoriaHorario]:
        resultado = await self.db.execute(
            select(ConsultoriaHorario)
            .where(
                ConsultoriaHorario.incubado_email == incubado,
                ConsultoriaHorario.fim > a_partir_de,
            )
            .order_by(ConsultoriaHorario.inicio)
        )
        return list(resultado.scalars().all())
