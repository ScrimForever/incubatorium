"""Etapas do questionário (plano de negócio).

As etapas são definidas em código: nenhum perfil as altera pela aplicação. Cada etapa
tem um `id` estável, que é também a chave da aba dentro de `json_questionario`
(`"1"` a `"9"`, como o frontend grava). Alterar texto ou ordem não muda o `id`, então
avaliações antigas continuam apontando para a mesma etapa. Etapas descontinuadas
permanecem na lista com `ativa=False`. A etapa 1 (Setor de atuação) tem `avaliavel=False`:
não tem `nota` no JSON e não pode ser avaliada.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Etapa:
    id: int
    titulo: str
    ativa: bool = True
    avaliavel: bool = True

    @property
    def chave_json(self) -> str:
        """Chave da aba dentro de `json_questionario`."""
        return str(self.id)


ETAPAS: tuple[Etapa, ...] = (
    Etapa(1, "Setor de atuação", avaliavel=False),
    Etapa(2, "Desenvolva o Business Model Canvas para seu negócio"),
    Etapa(3, "Sumário executivo"),
    Etapa(4, "Equipe"),
    Etapa(5, "Planejamento/Desenvolvimento do Produto e/ou Serviço"),
    Etapa(6, "Planejamento das ações do Mercado"),
    Etapa(7, "Planejamento das ações de Marketing"),
    Etapa(8, "Planejamento da Estrutura, Gerência e Operações"),
    Etapa(9, "Planejamento Financeiro"),
)


def listar_etapas(apenas_ativas: bool = True) -> list[Etapa]:
    return [e for e in ETAPAS if e.ativa or not apenas_ativas]


def obter_etapa(etapa_id: int) -> Etapa | None:
    return next((e for e in ETAPAS if e.id == etapa_id), None)


def etapa_existe(etapa_id: int) -> bool:
    """Existe na lista, ativa ou histórica (avaliações antigas continuam válidas)."""
    return obter_etapa(etapa_id) is not None


def etapa_avaliavel(etapa_id: int) -> bool:
    """A etapa existe e recebe nota (a etapa 1, só de identificação, não recebe)."""
    etapa = obter_etapa(etapa_id)
    return etapa is not None and etapa.avaliavel


def etapa_respondida(json_questionario: dict | None, etapa_id: int) -> bool:
    """A etapa tem algum conteúdo preenchido (ignora a `nota`, que é do avaliador)."""
    etapa = obter_etapa(etapa_id)
    if etapa is None or not json_questionario:
        return False
    aba = json_questionario.get(etapa.chave_json)
    if not isinstance(aba, dict):
        return False
    return any(valor for chave, valor in aba.items() if chave != "nota")
