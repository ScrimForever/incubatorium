import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from domain.models.questionarios.questionario import (
    Questionario,
    StatusEnum,
)
from infra.db import User, gerar_codigo_ativacao


class TestStatusEnum:
    def test_status_enum_values(self):
        """Teste dos valores vÃ¡lidos de StatusEnum"""
        assert StatusEnum.iniciado.value == "iniciado"
        assert StatusEnum.pendente.value == "pendente"
        assert StatusEnum.aguardando_aprovacao.value == "aguardando_aprovacao"
        assert StatusEnum.aprovado.value == "aprovado"
        assert StatusEnum.rejeitado.value == "rejeitado"

    def test_status_enum_members_count(self):
        """Teste da quantidade de membros em StatusEnum"""
        assert len(list(StatusEnum)) == 5


class TestUserModel:
    @pytest.mark.asyncio
    async def test_criar_user(self, async_db: AsyncSession, sample_email):
        """Teste de criaÃ§Ã£o de usuÃ¡rio"""
        user = User(
            email=sample_email,
            hashed_password="hashed_pwd",
            is_active=True,
            is_admin=False,
            is_consultor=False,
            is_incubado=True,
            is_colaborador=False,
        )

        async_db.add(user)
        await async_db.commit()
        await async_db.refresh(user)

        assert user.email == sample_email
        assert user.is_active is False
        assert user.is_incubado is True

    @pytest.mark.asyncio
    async def test_user_codigo_ativacao_gerado_automaticamente(
        self, async_db: AsyncSession, sample_email
    ):
        """Teste se cÃ³digo de ativaÃ§Ã£o Ã© gerado automaticamente"""
        user = User(
            email=sample_email,
            hashed_password="hashed_pwd",
            is_active=False,
        )

        async_db.add(user)
        await async_db.commit()
        await async_db.refresh(user)

        assert user.codigo_ativacao is not None
        assert len(user.codigo_ativacao) == 6
        assert user.codigo_ativacao.isdigit()

    @pytest.mark.asyncio
    async def test_user_criado_inativo_por_padrao(
        self, async_db: AsyncSession, sample_email
    ):
        """Teste se usuÃ¡rio Ã© criado inativo por padrÃ£o"""
        user = User(
            email=sample_email,
            hashed_password="hashed_pwd",
        )

        async_db.add(user)
        await async_db.commit()
        await async_db.refresh(user)

        assert user.is_active is False

    def test_gerar_codigo_ativacao_formato(self):
        """Teste do formato do cÃ³digo gerado"""
        codigo = gerar_codigo_ativacao()

        assert len(codigo) == 6
        assert codigo.isdigit()

    def test_gerar_codigo_ativacao_aleatorio(self):
        """Teste se cÃ³digos gerados sÃ£o diferentes"""
        codigo1 = gerar_codigo_ativacao()
        codigo2 = gerar_codigo_ativacao()

        # Alta probabilidade de serem diferentes
        # (nÃ£o Ã© garantido, mas Ã© muito provÃ¡vel)
        assert codigo1 != codigo2  # Aceita ambos os casos


class TestQuestionarioModel:
    @pytest.mark.asyncio
    async def test_criar_questionario(self, async_db: AsyncSession, sample_email):
        """Teste de criaÃ§Ã£o de questionÃ¡rio"""
        questionario = Questionario(
            usuario_email=sample_email,
            status_questionario=StatusEnum.iniciado,
            json_questionario={"pergunta_1": "resposta_1"},
            criado_por=sample_email,
        )

        async_db.add(questionario)
        await async_db.commit()

        assert questionario.usuario_email == sample_email
        assert questionario.status_questionario == StatusEnum.iniciado
        assert questionario.json_questionario == {"pergunta_1": "resposta_1"}

    @pytest.mark.asyncio
    async def test_questionario_sem_json(self, async_db: AsyncSession, sample_email):
        """Teste de questionÃ¡rio sem JSON"""
        questionario = Questionario(
            usuario_email=sample_email,
            status_questionario=StatusEnum.iniciado,
            json_questionario=None,
            criado_por=sample_email,
        )

        async_db.add(questionario)
        await async_db.commit()

        assert questionario.json_questionario is None

    @pytest.mark.asyncio
    async def test_questionario_timestamps(self, async_db: AsyncSession, sample_email):
        """Teste de timestamps automÃ¡ticos"""
        questionario = Questionario(
            usuario_email=sample_email,
            status_questionario=StatusEnum.iniciado,
            criado_por=sample_email,
        )

        async_db.add(questionario)
        await async_db.commit()
        await async_db.refresh(questionario)

        # Verificar se criado_em e atualizado_em foram definidos
        assert hasattr(questionario, "criado_em")
        assert hasattr(questionario, "atualizado_em")
        assert questionario.criado_em is not None

    @pytest.mark.asyncio
    async def test_questionario_usuario_email_primary_key(
        self, async_db: AsyncSession, sample_email
    ):
        """Teste se usuario_email Ã© primary key"""
        questionario = Questionario(
            usuario_email=sample_email,
            status_questionario=StatusEnum.iniciado,
            criado_por=sample_email,
        )

        async_db.add(questionario)
        await async_db.commit()

        # Tentar adicionar outro com mesmo email deve falhar
        questionario2 = Questionario(
            usuario_email=sample_email,
            status_questionario=StatusEnum.pendente,
            criado_por=sample_email,
        )

        async_db.add(questionario2)

        with pytest.raises(IntegrityError):
            await async_db.commit()
