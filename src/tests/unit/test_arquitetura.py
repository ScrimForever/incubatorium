"""Constituição I: routers e dependências não acessam o banco diretamente."""

import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
PADRAO_BANCO = re.compile(
    r"\bdb\.(get|execute|add|commit|refresh)\(|\bselect\(|\bupdate\("
)


def _arquivos_novos():
    yield from sorted((RAIZ / "routers").glob("*.py"))
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


def _importa(*camadas):
    return re.compile(
        r"^\s*(?:from|import)\s+(?:src\.)?(?:" + "|".join(camadas) + r")\b"
    )


def _varrer(pasta, padrao, excluir=()):
    """Linhas dos .py de `pasta` (recursivo) que casam com `padrao`."""
    infratores = []
    for arquivo in sorted((RAIZ / pasta).rglob("*.py")):
        if arquivo.name in excluir:
            continue
        for numero, linha in enumerate(
            arquivo.read_text(encoding="utf-8").splitlines(), 1
        ):
            if padrao.search(linha):
                infratores.append(
                    f"{arquivo.relative_to(RAIZ)}:{numero}: {linha.strip()}"
                )
    return infratores


def test_domain_nao_importa_de_infra_nem_de_camadas_superiores():
    infratores = _varrer(
        "domain", _importa("infra", "repository", "services", "routers", "auth")
    )
    assert infratores == [], (
        "domain importando camadas superiores:\n" + "\n".join(infratores)
    )


def test_repository_nao_importa_de_services_nem_routers():
    infratores = _varrer("repository", _importa("services", "routers"))
    assert infratores == [], (
        "repository importando camadas superiores:\n" + "\n".join(infratores)
    )


def test_services_nao_importam_de_routers():
    infratores = _varrer("services", _importa("routers"))
    assert infratores == [], (
        "services importando routers:\n" + "\n".join(infratores)
    )


PADRAO_CONSTRUTOR = re.compile(r"\b\w*(?:Service|Repository)\(")


def test_routers_nao_constroem_services_nem_repositories():
    infratores = _varrer(
        "routers", PADRAO_CONSTRUTOR, excluir=("dependencias.py",)
    )
    assert infratores == [], (
        "routers devem receber dependências via Depends:\n" + "\n".join(infratores)
    )
