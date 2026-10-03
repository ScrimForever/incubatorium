import pytest

from domain.models.questionarios.questionario import Questionario, StatusEnum
from services.arquivos.arquivos_service import ArquivosService
from shared.exceptions import ConflitoError, NaoEncontradoError

EMAIL = "ana@example.com"


@pytest.fixture
def criar(async_db):
    async def _criar(status=StatusEnum.pendente, json=None):
        async_db.add(
            Questionario(
                usuario_email=EMAIL,
                status_questionario=status,
                json_questionario=json or {},
                criado_por=EMAIL,
            )
        )
        await async_db.commit()

    return _criar


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status", [StatusEnum.iniciado, StatusEnum.pendente, StatusEnum.aprovado]
)
async def test_estados_editaveis(async_db, criar, status):
    await criar(status)
    assert await ArquivosService(async_db).verificar_edicao(EMAIL)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status", [StatusEnum.aguardando_aprovacao, StatusEnum.rejeitado]
)
async def test_estados_nao_editaveis_da_conflito(async_db, criar, status):
    await criar(status)
    with pytest.raises(ConflitoError):
        await ArquivosService(async_db).verificar_edicao(EMAIL)


@pytest.mark.asyncio
async def test_sem_questionario_da_nao_encontrado(async_db):
    with pytest.raises(NaoEncontradoError):
        await ArquivosService(async_db).verificar_edicao(EMAIL)
