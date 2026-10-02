"""Referências de anexos dentro de `json_questionario`.

Os arquivos ficam em disco e entram só pelo endpoint de arquivos (multipart). O JSON guarda,
em `json_questionario[aba]["arquivos"]`, a referência de cada um:

    {"nome": "balanco.pdf", "tipo": "application/pdf", "tamanho": 1234,
     "caminho": "<e-mail sem @ e .>/<aba>/balanco.pdf"}

`caminho` é relativo à pasta de uploads e identifica a referência (reenviar o mesmo arquivo a
substitui). A lista é do servidor: o incubado não a altera ao salvar suas respostas.
"""

import copy
from collections.abc import Iterable
from typing import Any

from src.domain.models.questionarios.etapas import ETAPAS
from src.shared.armazenamento import caminho_relativo


def nova_referencia(
    email: str, aba: int, nome: str, tipo: str | None, tamanho: int
) -> dict[str, Any]:
    return {
        "nome": nome,
        "tipo": tipo or "application/octet-stream",
        "tamanho": tamanho,
        "caminho": caminho_relativo(email, aba, nome),
    }


def _lista(aba: Any) -> list[dict[str, Any]]:
    arquivos = aba.get("arquivos") if isinstance(aba, dict) else None
    return (
        [a for a in arquivos if isinstance(a, dict)]
        if isinstance(arquivos, list)
        else []
    )


def adicionar_referencias(
    json_questionario: dict[str, Any] | None,
    aba: int,
    referencias: list[dict[str, Any]],
) -> dict[str, Any]:
    """Cópia do JSON com as referências na etapa; o mesmo `caminho` substitui, sem duplicar."""
    resultado = copy.deepcopy(json_questionario) if json_questionario else {}
    chave = str(aba)
    etapa = resultado.get(chave)
    etapa = etapa if isinstance(etapa, dict) else {}
    novos = {r["caminho"] for r in referencias}
    mantidos = [a for a in _lista(etapa) if a.get("caminho") not in novos]
    etapa["arquivos"] = mantidos + copy.deepcopy(referencias)
    resultado[chave] = etapa
    return resultado


def remover_referencias(
    json_questionario: dict[str, Any] | None, aba: int, nomes: Iterable[str]
) -> dict[str, Any]:
    resultado = copy.deepcopy(json_questionario) if json_questionario else {}
    etapa = resultado.get(str(aba))
    if isinstance(etapa, dict) and "arquivos" in etapa:
        excluir = set(nomes)
        etapa["arquivos"] = [a for a in _lista(etapa) if a.get("nome") not in excluir]
    return resultado


def preservar_arquivos(
    novo: dict[str, Any] | None, atual: dict[str, Any] | None
) -> dict[str, Any] | None:
    """Respostas novas do incubado + referências já gravadas.

    O `arquivos` vindo do cliente é descartado: vale a lista do servidor (ou `[]`).
    Etapas que só existem com anexos no questionário atual são mantidas.
    """
    if novo is None:
        return None
    resultado = copy.deepcopy(novo)
    atual = atual or {}
    for etapa in ETAPAS:
        chave = etapa.chave_json
        gravados = _lista(atual.get(chave))
        aba_nova = resultado.get(chave)
        if isinstance(aba_nova, dict):
            if gravados or "arquivos" in aba_nova:
                aba_nova["arquivos"] = copy.deepcopy(gravados)
        elif gravados and aba_nova is None:
            resultado[chave] = {"arquivos": copy.deepcopy(gravados)}
    return resultado


def reescrever_caminhos(
    json_questionario: dict[str, Any] | None, pasta_de: str, pasta_para: str
) -> dict[str, Any]:
    """Troca a pasta de origem pela de destino nos `caminho` (questionário arquivado)."""
    resultado = copy.deepcopy(json_questionario) if json_questionario else {}
    prefixo = f"{pasta_de}/"
    for etapa in ETAPAS:
        for anexo in _lista(resultado.get(etapa.chave_json)):
            caminho = anexo.get("caminho")
            if isinstance(caminho, str) and caminho.startswith(prefixo):
                anexo["caminho"] = f"{pasta_para}/{caminho[len(prefixo) :]}"
    return resultado


def etapas_com_conteudo_embutido(json_questionario: dict[str, Any] | None) -> list[int]:
    """Etapas cujo `arquivos` traz `conteudo_base64` (formato não aceito)."""
    return [
        etapa.id
        for etapa in ETAPAS
        if any(
            "conteudo_base64" in anexo
            for anexo in _lista((json_questionario or {}).get(etapa.chave_json))
        )
    ]


def tem_conteudo_embutido(json_questionario: dict[str, Any] | None) -> bool:
    return bool(etapas_com_conteudo_embutido(json_questionario))
