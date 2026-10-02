"""Validação de anexos: nome, extensão, tamanho e conteúdo real (assinatura do arquivo)."""

from pathlib import PurePosixPath

from src.shared.exceptions.arquivo_exceptions import ArquivoException
from src.shared.exceptions.negocio_exceptions import ValidacaoNegocioError

ASSINATURAS: dict[str, tuple[bytes, ...]] = {
    ".pdf": (b"%PDF-",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".docx": (b"PK\x03\x04",),
    ".xlsx": (b"PK\x03\x04",),
    ".pptx": (b"PK\x03\x04",),
    ".doc": (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",),
    ".xls": (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",),
    ".ppt": (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",),
}
EXTENSOES_TEXTO = (".txt", ".csv")
EXTENSOES_PERMITIDAS = tuple(ASSINATURAS) + EXTENSOES_TEXTO
BYTES_ASSINATURA = 16


class ArquivoInvalidoError(ArquivoException):
    """Anexo recusado pela validação (nome, tipo, conteúdo ou tamanho)."""

    def __init__(self, nome_arquivo: str, motivo: str) -> None:
        self.nome_arquivo = nome_arquivo
        self.motivo = motivo
        super().__init__(f"Arquivo '{nome_arquivo}' recusado: {motivo}")


def nome_seguro(nome: str | None) -> str:
    """Só o nome-base: descarta diretórios (`../`) e rejeita nomes vazios."""
    base = PurePosixPath((nome or "").replace("\\", "/")).name
    if not base or base in (".", ".."):
        raise ArquivoInvalidoError(nome or "", "nome de arquivo inválido")
    return base


def validar_extensao(nome: str) -> str:
    extensao = PurePosixPath(nome).suffix.lower()
    if extensao not in EXTENSOES_PERMITIDAS:
        raise ArquivoInvalidoError(
            nome, f"tipo não permitido (aceitos: {', '.join(EXTENSOES_PERMITIDAS)})"
        )
    return extensao


def validar_conteudo(nome: str, extensao: str, cabecalho: bytes) -> None:
    """O início do arquivo precisa corresponder à extensão declarada."""
    if extensao in EXTENSOES_TEXTO:
        if b"\x00" in cabecalho:
            raise ArquivoInvalidoError(nome, "o conteúdo não é texto")
        return
    if not any(
        cabecalho.startswith(assinatura) for assinatura in ASSINATURAS[extensao]
    ):
        raise ArquivoInvalidoError(
            nome, "o conteúdo não corresponde ao tipo do arquivo"
        )


def validar_tamanho(nome: str, tamanho: int, maximo: int) -> None:
    if tamanho > maximo:
        raise ArquivoInvalidoError(
            nome, f"tamanho acima do limite de {maximo // (1024 * 1024)} MB"
        )


def rejeitar_anexos_embutidos(json_questionario: dict | None) -> None:
    """Anexos entram só pelo endpoint de arquivos: recusa `conteudo_base64` no JSON (422)."""
    from src.domain.models.questionarios.arquivos import etapas_com_conteudo_embutido

    etapas = etapas_com_conteudo_embutido(json_questionario)
    if etapas:
        lista = ", ".join(str(e) for e in etapas)
        raise ValidacaoNegocioError(
            f"Anexos não podem vir dentro do questionário (etapa(s) {lista}). "
            "Envie cada arquivo por POST /arquivos/questionario/{aba} (multipart form)."
        )
