import copy
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
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
        chave = str(etapa_id)
        novo_json = copy.deepcopy(questionario.json_questionario or {})
        aba = dict(novo_json.get(chave) or {})
        aba["nota"] = {
            "valor": valor,
            "texto": parecer,
            "avaliador": avaliador,
            "avaliado_em": quando.isoformat(),
        }
        novo_json[chave] = aba
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
        """(etapa_id, nota) das abas numeradas que já têm avaliação (valor ou parecer)."""
        avaliadas = []
        for chave, aba in (questionario.json_questionario or {}).items():
            nota = aba.get("nota") if isinstance(aba, dict) else None
            if (
                chave.isdecimal()
                and isinstance(nota, dict)
                and (nota.get("valor") is not None or nota.get("texto"))
            ):
                avaliadas.append((int(chave), nota))
        return sorted(avaliadas, key=lambda item: item[0])
