import copy
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.questionarios.etapas import obter_etapa
from src.domain.models.questionarios.notas import notas_avaliadas
from src.domain.models.questionarios.questionario import Questionario


class AvaliacaoRepository:
    """Notas das etapas, gravadas em `json_questionario[etapa].nota`."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def buscar_questionario(
        self, email: str, para_atualizar: bool = False
    ) -> Questionario | None:
        consulta = select(Questionario).where(Questionario.usuario_email == email)
        if para_atualizar:
            consulta = consulta.with_for_update()  # evita corrida com o PUT do incubado
        resultado = await self.db.execute(consulta)
        return resultado.scalar_one_or_none()

    async def gravar_nota(
        self,
        questionario: Questionario,
        etapa_id: int,
        valor: int,
        parecer: str,
        avaliador: str,
        quando: datetime,
    ) -> dict:
        """Substitui a nota da etapa; reatribui um novo dict para o JSONB ser regravado."""
        etapa = obter_etapa(etapa_id)
        novo_json = copy.deepcopy(questionario.json_questionario or {})
        aba = dict(novo_json.get(etapa.chave_json) or {})
        aba["nota"] = {
            "valor": valor,
            "texto": parecer,
            "avaliador": avaliador,
            "avaliado_em": quando.isoformat(),
        }
        novo_json[etapa.chave_json] = aba
        questionario.json_questionario = novo_json
        questionario.ultima_avaliacao_em = quando  # evita ler o JSON no painel
        try:
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise
        return aba["nota"]

    @staticmethod
    def listar_notas(questionario: Questionario) -> list[tuple[int, dict]]:
        return notas_avaliadas(questionario.json_questionario)
