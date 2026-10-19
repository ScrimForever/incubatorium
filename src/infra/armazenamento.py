"""Anexos do questionário no disco local."""

import hashlib
import shutil
from collections.abc import AsyncIterator
from pathlib import Path

import aiofiles


def sanitizar_email(email: str) -> str:
    """Nome de pasta do e-mail: SHA-256 em hexadecimal.

    Só `0-9a-f`, então vale em qualquer sistema de arquivos. E-mails distintos geram
    pastas distintas. O login ignora maiúsculas, então normalizamos antes.
    """
    return hashlib.sha256(email.lower().encode()).hexdigest()


class ArmazenamentoLocal:
    def __init__(self, raiz: Path = Path("questionarios")):
        self.raiz = raiz

    def _pasta_usuario(self, email: str) -> Path:
        return self.raiz / sanitizar_email(email)

    def pasta(self, email: str, aba: int) -> Path:
        return self._pasta_usuario(email) / str(aba)

    def caminho_relativo(self, email: str, aba: int, nome: str) -> str:
        """Caminho do arquivo relativo à raiz (o que o JSON do questionário guarda)."""
        return (Path(sanitizar_email(email)) / str(aba) / nome).as_posix()

    def preparar(self, email: str, aba: int) -> Path:
        """Cria (se preciso) a pasta da aba do usuário."""
        pasta = self.pasta(email, aba)
        pasta.mkdir(parents=True, exist_ok=True)
        return pasta

    def listar(self, email: str, aba: int) -> list[str]:
        pasta = self.pasta(email, aba)
        if not pasta.exists():
            return []
        return [p.name for p in pasta.iterdir() if p.is_file()]

    async def gravar(
        self, email: str, aba: int, nome: str, partes: AsyncIterator[bytes]
    ) -> int:
        """Grava as partes em `nome` e devolve o total de bytes gravados."""
        caminho = self.preparar(email, aba) / nome
        total = 0
        async with aiofiles.open(caminho, "wb") as buffer:
            async for parte in partes:
                total += len(parte)
                await buffer.write(parte)
        return total

    def apagar(self, email: str, aba: int, nomes: list[str]) -> None:
        pasta = self.pasta(email, aba)
        for nome in nomes:
            (pasta / nome).unlink(missing_ok=True)

    def arquivar(self, email: str, ordem: int) -> bool:
        """Copia os anexos do questionário vigente para a pasta do arquivado `<email>_<ordem>`.

        A pasta vigente é mantida, então o novo questionário nasce com os mesmos anexos.
        Devolve False quando o usuário não tinha anexos.
        """
        origem = self._pasta_usuario(email)
        if not origem.exists():
            return False
        destino = origem.with_name(f"{origem.name}_{ordem}")
        shutil.copytree(origem, destino, dirs_exist_ok=True)
        return True
