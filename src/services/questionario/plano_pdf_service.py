import re
import unicodedata
from datetime import UTC, datetime

from src.repository.questionario import QuestionarioRepository
from src.repository.usuarios import UsuariosRepository
from src.services.questionario.plano_pdf import emails_citados, gerar_pdf_plano
from src.shared.exceptions import NaoEncontradoError


def _slug(texto: str) -> str:
    ascii_ = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_.lower()).strip("-")[:60] or "sem-nome"


class PlanoPdfService:
    """PDF do plano de negócio (questionário) para download."""

    def __init__(
        self, questionarios: QuestionarioRepository, usuarios: UsuariosRepository
    ):
        self.questionarios = questionarios
        self.usuarios = usuarios

    async def gerar(self, questionario_id: int, gerado_por: str) -> tuple[str, bytes]:
        """(prefixo do nome do arquivo, conteúdo do PDF)."""
        questionario = await self.questionarios.buscar_por_id(questionario_id)
        if questionario is None:
            raise NaoEncontradoError("Questionário não encontrado.")
        pessoas = await self.usuarios.identificacoes(emails_citados(questionario))
        nomes = {email: nome for email, (nome, _) in pessoas.items()}
        negocio = ((questionario.json_questionario or {}).get("1") or {}).get(
            "nome_negocio"
        )
        conteudo = gerar_pdf_plano(questionario, nomes, gerado_por, datetime.now(UTC))
        return f"plano-{_slug(negocio if isinstance(negocio, str) else '')}", conteudo
