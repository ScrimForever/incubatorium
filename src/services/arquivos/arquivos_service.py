import mimetypes
from pathlib import Path

from src.domain.models.questionario import Questionario, StatusEnum
from src.infra.armazenamento import ArmazenamentoLocal
from src.infra.config import settings
from src.logger import logger
from src.repository.questionario import QuestionarioRepository
from src.shared.exceptions import (
    ArquivoNaoEncontradoError,
    ConflitoError,
    ErroAoSalvarArquivoError,
    NaoEncontradoError,
)
from src.shared.validacao_arquivos import (
    BYTES_ASSINATURA,
    ArquivoInvalidoError,
    nome_seguro,
    validar_conteudo,
    validar_extensao,
    validar_tamanho,
)

STATUS_EDITAVEIS = (StatusEnum.iniciado, StatusEnum.pendente, StatusEnum.aprovado)
CHUNK_SIZE = 1024 * 1024  # 1MB


class ErroAoCriarDiretorioError(OSError):
    """Não foi possível criar a pasta de upload."""


class ArquivosService:
    """Regras dos anexos: edição só em estado editável, validação e gravação."""

    def __init__(
        self,
        questionarios: QuestionarioRepository,
        armazenamento: ArmazenamentoLocal,
    ):
        self.questionarios = questionarios
        self.armazenamento = armazenamento

    @staticmethod
    def _checar_edicao(questionario: Questionario | None) -> Questionario:
        if questionario is None:
            raise NaoEncontradoError("Questionário não encontrado.")
        if questionario.status_questionario not in STATUS_EDITAVEIS:
            raise ConflitoError(
                "Não é possível alterar anexos no estado "
                f"'{questionario.status_questionario.value}'."
            )
        return questionario

    async def verificar_edicao(self, email: str) -> Questionario:
        """Antes de gravar/apagar arquivos: questionário existe e é editável."""
        return self._checar_edicao(await self.questionarios.buscar(email))

    async def receber(self, email: str, aba: int, arquivos: list) -> list[dict]:
        """Valida e grava os anexos; se um falhar, remove os já gravados no envio."""
        try:
            self.armazenamento.preparar(email, aba)
        except OSError as e:
            raise ErroAoCriarDiretorioError(str(e)) from e

        maximo = settings.upload_tamanho_maximo_mb * 1024 * 1024
        recebidos: list[dict] = []
        gravados: list[str] = []
        for arquivo in arquivos:
            try:
                nome = nome_seguro(arquivo.filename)
                extensao = validar_extensao(nome)
                gravados.append(nome)
                tamanho = await self.armazenamento.gravar(
                    email, aba, nome, self._partes(arquivo, nome, extensao, maximo)
                )
                if tamanho == 0:
                    raise ArquivoInvalidoError(nome, "arquivo vazio")
                recebidos.append(
                    {
                        "nome": nome,
                        "content_type": arquivo.content_type,
                        "tamanho": tamanho,
                        "caminho": self.armazenamento.caminho_relativo(
                            email, aba, nome
                        ),
                    }
                )
            except ArquivoInvalidoError as e:
                self.armazenamento.apagar(email, aba, gravados)
                logger.warning(f"Anexo recusado: {e}")
                raise
            except OSError as e:
                self.armazenamento.apagar(email, aba, gravados)
                logger.error(f"Erro ao salvar arquivo {arquivo.filename}: {e}")
                raise ErroAoSalvarArquivoError(arquivo.filename, str(e)) from e
        return recebidos

    @staticmethod
    async def _partes(arquivo, nome: str, extensao: str, maximo: int):
        tamanho = 0
        while chunk := await arquivo.read(CHUNK_SIZE):
            if tamanho == 0:
                validar_conteudo(nome, extensao, chunk[:BYTES_ASSINATURA])
            tamanho += len(chunk)
            validar_tamanho(nome, tamanho, maximo)
            yield chunk

    def listar(self, email: str, aba: int) -> list[str]:
        return self.armazenamento.listar(email, aba)

    def caminho_download(self, email: str, aba: int, nome: str) -> Path:
        """Caminho do anexo para download; `ArquivoNaoEncontradoError` se não existir."""
        caminho = self.armazenamento.pasta(email, aba) / nome_seguro(nome)
        if not caminho.exists():
            raise ArquivoNaoEncontradoError(nome)
        return caminho

    @staticmethod
    def tipo_midia(nome: str) -> str | None:
        return mimetypes.guess_type(nome)[0]

    async def apagar(self, email: str, aba: int, nomes: list[str]) -> dict:
        existentes = set(self.armazenamento.listar(email, aba))
        deletados: list[str] = []
        erros: list[dict] = []
        for nome in nomes:
            if nome not in existentes:
                erros.append({"arquivo": nome, "erro": "Arquivo não encontrado"})
                continue
            try:
                self.armazenamento.apagar(email, aba, [nome])
                deletados.append(nome)
            except OSError as e:
                logger.error(f"Erro ao deletar {nome}: {e}")
                erros.append({"arquivo": nome, "erro": str(e)})
        return {"arquivos_deletados": deletados, "erros": erros if erros else None}
