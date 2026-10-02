"""Notas dos consultores dentro de `json_questionario`.

Cada aba avaliável (`"2"` a `"9"`; a `"1"` não tem nota) carrega `nota = {valor, texto, avaliador, avaliado_em}`; o
frontend já usa `valor`, `texto` e `avaliador`, e `avaliado_em` é o registro da data. Só o
consultor escreve a nota; o incubado nunca a altera ao salvar suas respostas.
"""

import copy
from typing import Any

from src.domain.models.questionarios.etapas import ETAPAS


def nota_vazia() -> dict[str, Any]:
    return {"valor": None, "texto": "", "avaliador": None, "avaliado_em": None}


def nota_da_aba(aba: Any) -> dict[str, Any] | None:
    if isinstance(aba, dict) and isinstance(aba.get("nota"), dict):
        return aba["nota"]
    return None


def mesclar_preservando_notas(
    novo: dict[str, Any] | None, atual: dict[str, Any] | None
) -> dict[str, Any] | None:
    """Respostas novas do incubado + notas já gravadas.

    A `nota` vinda do incubado é descartada: vale a que está salva (ou a vazia, se a aba
    nunca foi avaliada). Abas que só existem com nota no questionário atual são mantidas.
    """
    if novo is None:
        return None
    resultado = copy.deepcopy(novo)
    atual = atual or {}
    for etapa in ETAPAS:
        chave = etapa.chave_json
        aba_nova = resultado.get(chave)
        if not etapa.avaliavel:
            if isinstance(aba_nova, dict):
                aba_nova.pop("nota", None)
            continue
        nota_salva = nota_da_aba(atual.get(chave))
        if isinstance(aba_nova, dict):
            aba_nova["nota"] = copy.deepcopy(nota_salva) if nota_salva else nota_vazia()
        elif nota_salva and aba_nova is None:
            resultado[chave] = {"nota": copy.deepcopy(nota_salva)}
    return resultado


def zerar_notas(json_questionario: dict[str, Any] | None) -> dict[str, Any]:
    """Cópia do JSON com todas as notas zeradas (novo questionário após rejeição)."""
    resultado = copy.deepcopy(json_questionario) if json_questionario else {}
    for etapa in ETAPAS:
        aba = resultado.get(etapa.chave_json)
        if not isinstance(aba, dict):
            continue
        if not etapa.avaliavel:
            aba.pop("nota", None)
        elif "nota" in aba:
            aba["nota"] = nota_vazia()
    return resultado


def notas_avaliadas(
    json_questionario: dict[str, Any] | None,
) -> list[tuple[int, dict[str, Any]]]:
    """(etapa_id, nota) das etapas que já têm avaliação (valor ou parecer)."""
    avaliadas = []
    for etapa in ETAPAS:
        if not etapa.avaliavel:
            continue
        nota = nota_da_aba((json_questionario or {}).get(etapa.chave_json))
        if nota and (nota.get("valor") is not None or nota.get("texto")):
            avaliadas.append((etapa.id, nota))
    return avaliadas
