from src.domain.models.usuario import User
from src.domain.schemas.questionario_schema import SelecaoAvaliadoresInput
from src.logger import logger
from src.repository.questionario import QuestionarioRepository
from src.repository.usuarios import UsuariosRepository
from src.shared.exceptions import NaoEncontradoError, ValidacaoNegocioError


class SelecaoAvaliadoresService:
    def __init__(
        self, questionarios: QuestionarioRepository, usuarios: UsuariosRepository
    ):
        self.questionarios = questionarios
        self.usuarios = usuarios

    async def selecionar(
        self, autor: User, entrada: SelecaoAvaliadoresInput
    ) -> dict:
        """Substitui os avaliadores do questionário. Todos precisam ser consultores."""
        questionario = await self.questionarios.buscar_por_id(entrada.questionario_id)
        if questionario is None:
            raise NaoEncontradoError("Questionário não encontrado.")

        emails = list(dict.fromkeys(entrada.avaliadores))
        consultores = await self.usuarios.emails_consultores(emails)
        recusados = [email for email in emails if email not in consultores]
        if recusados:
            raise ValidacaoNegocioError(
                "Existem e-mails não avaliadores na solicitação: "
                + ", ".join(recusados)
            )

        await self.questionarios.substituir_avaliadores(
            questionario, emails, autor.email
        )
        logger.info(
            f"Avaliadores do questionário {questionario.id} definidos por {autor.email}."
        )
        return {"questionario_id": questionario.id, "avaliadores": emails}
