from dataclasses import dataclass

from src.domain.models.consultoria import ConsultoriaHorario
from src.logger import logger
from src.services.contratos import Notificador
from src.shared.datas import formatar_local


@dataclass(frozen=True)
class Aviso:
    """E-mail já montado: pode ser enviado depois do commit, sem tocar no banco."""

    email: str
    assunto: str
    titulo: str
    mensagem: str
    detalhe: str = ""
    convite_ics: str = ""


def linhas_incubado(nome: str, empresa: str | None) -> list[str]:
    """Identificação do incubado no detalhe dos e-mails, uma informação por linha."""
    return [f"Incubado: {nome}"] + ([f"Empresa: {empresa}"] if empresa else [])


def aviso_horario(
    horario: ConsultoriaHorario,
    consultor: str,
    assunto: str,
    titulo: str,
    mensagem: str,
) -> Aviso:
    """Aviso ao incubado que reservou `horario`; `consultor` é o nome de exibição."""
    return Aviso(
        email=horario.incubado_email,
        assunto=assunto,
        titulo=titulo,
        mensagem=mensagem,
        detalhe=f"Consultor: {consultor}\nHorário: {formatar_local(horario.inicio)}",
    )


class EnviadorDeAvisos:
    """Entrega avisos já montados por um `Notificador`."""

    def __init__(self, notificador: Notificador):
        self.notificador = notificador

    async def enviar(self, avisos: list[Aviso]) -> None:
        """Um destinatário com falha não impede os demais."""
        for aviso in avisos:
            try:
                await self.notificador.enviar_notificacao(
                    aviso.email,
                    aviso.assunto,
                    aviso.titulo,
                    aviso.mensagem,
                    aviso.detalhe,
                    aviso.convite_ics,
                )
            except Exception as erro:  # noqa: BLE001
                logger.error(f"Falha ao avisar {aviso.email}: {erro}")
