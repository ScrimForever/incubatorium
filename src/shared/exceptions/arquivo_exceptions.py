"""Exceções relacionadas a operações com arquivos."""


class ArquivoException(Exception):
    """Exceção base para operações com arquivos."""


class ArquivoNaoEncontradoError(ArquivoException):
    """Lançada quando um arquivo não é encontrado."""

    def __init__(self, nome_arquivo: str) -> None:
        self.nome_arquivo = nome_arquivo
        super().__init__(f"Arquivo '{nome_arquivo}' não encontrado")


class DiretorioNaoEncontradoError(ArquivoException):
    """Lançada quando um diretório não existe."""

    def __init__(self, caminho: str) -> None:
        self.caminho = caminho
        super().__init__(f"Diretório '{caminho}' não encontrado")


class ErroAoSalvarArquivoError(ArquivoException):
    """Lançada quando há erro ao salvar um arquivo."""

    def __init__(self, nome_arquivo: str, motivo: str = "") -> None:
        self.nome_arquivo = nome_arquivo
        self.motivo = motivo
        msg = f"Erro ao salvar arquivo '{nome_arquivo}'"
        if motivo:
            msg += f": {motivo}"
        super().__init__(msg)


class ErroAoDeletarArquivoError(ArquivoException):
    """Lançada quando há erro ao deletar um arquivo."""

    def __init__(self, nome_arquivo: str, motivo: str = "") -> None:
        self.nome_arquivo = nome_arquivo
        self.motivo = motivo
        msg = f"Erro ao deletar arquivo '{nome_arquivo}'"
        if motivo:
            msg += f": {motivo}"
        super().__init__(msg)


class ErroAoListarArquivosError(ArquivoException):
    """Lançada quando há erro ao listar arquivos."""

    def __init__(self, caminho: str, motivo: str = "") -> None:
        self.caminho = caminho
        self.motivo = motivo
        msg = f"Erro ao listar arquivos em '{caminho}'"
        if motivo:
            msg += f": {motivo}"
        super().__init__(msg)


class ErroAoFazerDownloadError(ArquivoException):
    """Lançada quando há erro ao fazer download de um arquivo."""

    def __init__(self, nome_arquivo: str, motivo: str = "") -> None:
        self.nome_arquivo = nome_arquivo
        self.motivo = motivo
        msg = f"Erro ao fazer download de '{nome_arquivo}'"
        if motivo:
            msg += f": {motivo}"
        super().__init__(msg)
