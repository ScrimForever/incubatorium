"""Caminhos dos anexos do questionário no disco."""

import hashlib
import shutil
from pathlib import Path

UPLOAD_DIR = Path("questionarios")


def sanitizar_email(email: str) -> str:
    """Nome de pasta do e-mail: SHA-256 em hexadecimal.

    Só `0-9a-f`, então vale em qualquer sistema de arquivos. E-mails distintos geram
    pastas distintas. O login ignora maiúsculas, então normalizamos antes.
    """
    return hashlib.sha256(email.lower().encode()).hexdigest()


def pasta_usuario(email: str) -> Path:
    return UPLOAD_DIR / sanitizar_email(email)


def caminho_etapa(email: str, aba: int) -> Path:
    return pasta_usuario(email) / str(aba)


def caminho_relativo(email: str, aba: int, nome: str) -> str:
    """Caminho do arquivo relativo à pasta de uploads (o que o JSON do questionário guarda)."""
    return (Path(sanitizar_email(email)) / str(aba) / nome).as_posix()


def arquivar_pasta(email: str, ordem: int) -> bool:
    """Copia os anexos do questionário vigente para a pasta do arquivado `<email>_<ordem>`.

    A pasta vigente é mantida, então o novo questionário nasce com os mesmos anexos.
    Devolve False quando o usuário não tinha anexos.
    """
    origem = pasta_usuario(email)
    if not origem.exists():
        return False
    destino = origem.with_name(f"{origem.name}_{ordem}")
    shutil.copytree(origem, destino, dirs_exist_ok=True)
    return True
dd