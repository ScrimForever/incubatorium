from typing import Literal

from loguru import logger
from sqlalchemy import select, update
from sqlalchemy.exc import NoResultFound, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.questionarios.questionario import Questionario
from src.domain.schemas.questionario_schema import QuestionarioInputSchema
from src.infra.db import User


class QuestionarioRepository:
    def __init__(self, user: User, db: AsyncSession):

        self.db = db
        self.user = user

    async def buscar_questionario(
        self,
    ) -> Questionario | Literal[False]:

        query = select(Questionario).where(
            Questionario.usuario_email == self.user.email
        )
        try:
            results = await self.db.execute(query)
            questionario = results.scalar_one()
            logger.success("O questionário foi encontrado.")
            return questionario
        except NoResultFound as e:
            logger.warning(
                f"Não foi possível identificar questionário para o usuário informado: {e}"
            )
            return False
        except SQLAlchemyError as e:
            logger.error(e)
            return False

    async def gravar_questionario(
        self, input_questionario: QuestionarioInputSchema
    ) -> Questionario | Literal[False]:
        query = select(Questionario).where(
            Questionario.usuario_email == self.user.email
        )
        try:
            results = await self.db.execute(query)
            results.scalar_one()
            return False
        except NoResultFound:
            logger.warning(
                f"Questionário ainda não existe. Criando o questionário para o usuário: {self.user.email}"
            )
            questionario_data = input_questionario.model_dump()
            questionario_data.update(
                {
                    "usuario_email": f"{self.user.email}",
                    "criado_por": f"{self.user.email}",
                }
            )
            questionario = Questionario(**questionario_data)
            self.db.add(questionario)
            await self.db.commit()
            return questionario
        except SQLAlchemyError as e:
            await self.db.rollback()
            logger.error(e)
            return False

    async def atualizar_questionario(
        self, input_questionario: QuestionarioInputSchema
    ) -> Questionario | Literal[False]:
        dados = input_questionario.model_dump(mode="json", exclude_unset=True)

        if not dados:
            logger.warning("Nenhum campo para atualizar foi enviado.")
            return False

        stmt = (
            update(Questionario)
            .where(Questionario.usuario_email == self.user.email)
            .values(**dados)
            .returning(Questionario)
        )
        try:
            result = await self.db.execute(stmt)
            questionario = result.scalar_one()
            await self.db.commit()
            return questionario
        except NoResultFound:
            logger.warning(
                f"Usuário: {self.user.email} não possui questionário cadastrado"
            )
            return False
        except SQLAlchemyError as e:
            await self.db.rollback()
            logger.error(e)
            return False
