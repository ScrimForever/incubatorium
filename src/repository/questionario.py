from sqlalchemy import select
from src.domain.models.questionario import Questionario, QuestionarioHistorico
from src.repository.base import Repositorio


class QuestionarioRepository(Repositorio):
    async def buscar(self, email: str) -> Questionario | None:
        resultado = await self.db.execute(
            select(Questionario).where(Questionario.usuario_email == email)
        )
        return resultado.scalars().first()

    async def buscar_para_atualizar(self, email: str) -> Questionario | None:
        """Bloqueia a linha até o fim da transação, para o `PUT` não sobrescrever
        uma nota gravada no mesmo instante pelo consultor (que também lê com `FOR UPDATE`)."""
        resultado = await self.db.execute(
            select(Questionario)
            .where(Questionario.usuario_email == email)
            .with_for_update()
        )
        return resultado.scalar_one_or_none()

    async def listar_todos(self) -> list[Questionario]:
        resultado = await self.db.execute(select(Questionario))
        return list(resultado.scalars().all())

    async def criar(self, questionario: Questionario) -> Questionario:
        """Grava o questionário e o primeiro registro do histórico na mesma transação."""
        self.db.add(questionario)
        await self.db.flush()
        self.adicionar_historico(
            QuestionarioHistorico(
                questionario_id=questionario.id,
                usuario_email=questionario.usuario_email,
                json_questionario=questionario.json_questionario,
                status_questionario=questionario.status_questionario,
            )
        )
        await self.salvar()
        await self.db.refresh(questionario)
        return questionario

    def adicionar_historico(self, historico: QuestionarioHistorico) -> None:
        """Inclui o registro na transação corrente (gravado no próximo `salvar()`)."""
        self.db.add(historico)
