from datetime import UTC, datetime

import pytest

from domain.models.questionarios.questionario import Questionario, StatusEnum
from repository.avaliacao.avaliacao_rep import AvaliacaoRepository

QUANDO = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)


async def _questionario(async_db, email, json):
    questionario = Questionario(
        usuario_email=email,
        status_questionario=StatusEnum.aguardando_aprovacao,
        json_questionario=json,
        criado_por=email,
    )
    async_db.add(questionario)
    await async_db.commit()
    return questionario


class TestGravarNota:
    @pytest.mark.asyncio
    async def test_grava_nota_na_etapa_e_preserva_o_resto(self, async_db):
        json = {
            "1": {"nome_proponente": "Ana"},
            "2": {"business_canvas": "Canvas", "nota": {"valor": None, "texto": ""}},
        }
        questionario = await _questionario(async_db, "ana@x.com", json)

        nota = await AvaliacaoRepository(async_db).gravar_nota(
            questionario, 2, 4, "Bom canvas", "cons@x.com", QUANDO
        )

        assert nota == {
            "valor": 4,
            "texto": "Bom canvas",
            "avaliador": "cons@x.com",
            "avaliado_em": QUANDO.isoformat(),
        }
        await async_db.refresh(questionario)
        assert questionario.json_questionario["2"]["business_canvas"] == "Canvas"
        assert questionario.json_questionario["2"]["nota"] == nota
        assert questionario.json_questionario["1"] == {"nome_proponente": "Ana"}

    @pytest.mark.asyncio
    async def test_nova_avaliacao_substitui_a_anterior(self, async_db):
        questionario = await _questionario(
            async_db, "ana@x.com", {"2": {"business_canvas": "Canvas"}}
        )
        repo = AvaliacaoRepository(async_db)
        await repo.gravar_nota(questionario, 2, 2, "Fraco", "a@x.com", QUANDO)

        await repo.gravar_nota(questionario, 2, 5, "Excelente", "b@x.com", QUANDO)

        await async_db.refresh(questionario)
        nota = questionario.json_questionario["2"]["nota"]
        assert (nota["valor"], nota["texto"], nota["avaliador"]) == (
            5,
            "Excelente",
            "b@x.com",
        )

    @pytest.mark.asyncio
    async def test_a_gravacao_persiste_no_jsonb(self, async_db):
        """O dict é reatribuído, então o SQLAlchemy detecta a mudança e regrava."""
        questionario = await _questionario(
            async_db, "ana@x.com", {"2": {"business_canvas": "Canvas"}}
        )

        await AvaliacaoRepository(async_db).gravar_nota(
            questionario, 2, 3, "Ok", "a@x.com", QUANDO
        )

        async_db.expire_all()
        recarregado = await AvaliacaoRepository(async_db).buscar_questionario(
            "ana@x.com"
        )
        assert recarregado.json_questionario["2"]["nota"]["valor"] == 3

    @pytest.mark.asyncio
    async def test_listar_notas_so_das_etapas_avaliadas(self, async_db):
        questionario = await _questionario(
            async_db,
            "ana@x.com",
            {
                "2": {"nota": {"valor": 4, "texto": "ok"}},
                "3": {"nota": {"valor": None}},
            },
        )

        notas = AvaliacaoRepository.listar_notas(questionario)

        assert [etapa for etapa, _ in notas] == [2]
