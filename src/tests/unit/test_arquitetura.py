"""Constituição I: routers e dependências não acessam o banco diretamente."""

import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
PADRAO_BANCO = re.compile(
    r"\bdb\.(get|execute|add|commit|refresh)\(|\bselect\(|\bupdate\("
)
# routers/questionario e routers/users são anteriores à feature (o plano os mantém como estão)
ANTIGOS = {"questionario", "users"}


def _arquivos_novos():
    for pasta in sorted((RAIZ / "routers").iterdir()):
        if pasta.is_dir() and pasta.name not in ANTIGOS and pasta.name != "__pycache__":
            yield from pasta.glob("*.py")
    yield RAIZ / "shared" / "permissoes.py"


def test_routers_novos_e_permissoes_nao_acessam_o_banco_direto():
    infratores = []
    for arquivo in _arquivos_novos():
        for numero, linha in enumerate(
            arquivo.read_text(encoding="utf-8").splitlines(), 1
        ):
            if PADRAO_BANCO.search(linha):
                infratores.append(
                    f"{arquivo.relative_to(RAIZ)}:{numero}: {linha.strip()}"
                )
    assert infratores == [], (
        "acesso direto ao banco fora dos repositórios:\n" + "\n".join(infratores)
    )


def test_nao_ha_print_no_codigo_da_aplicacao():
    pastas = (
        "routers",
        "services",
        "repository",
        "shared",
        "domain",
        "infra",
        "scripts",
    )
    infratores = []
    for pasta in pastas:
        for arquivo in (RAIZ / pasta).rglob("*.py"):
            for numero, linha in enumerate(
                arquivo.read_text(encoding="utf-8").splitlines(), 1
            ):
                if re.match(r"\s*print\(", linha):
                    infratores.append(f"{arquivo.relative_to(RAIZ)}:{numero}")
    assert infratores == [], f"use logger em vez de print: {infratores}"


PADRAO_IMPORT_PROIBIDO = re.compile(
    r"^\s*(?:from|import)\s+(?:src\.)?(?:infra|repository|services|routers|auth)\b"
)


def test_domain_nao_importa_de_infra_nem_de_camadas_superiores():
    infratores = []
    for arquivo in sorted((RAIZ / "domain").rglob("*.py")):
        for numero, linha in enumerate(
            arquivo.read_text(encoding="utf-8").splitlines(), 1
        ):
            if PADRAO_IMPORT_PROIBIDO.search(linha):
                infratores.append(
                    f"{arquivo.relative_to(RAIZ)}:{numero}: {linha.strip()}"
                )
    assert infratores == [], (
        "domain importando camadas superiores:\n" + "\n".join(infratores)
    )
