import pytest

from domain.models.questionarios.questionario import Questionario, StatusEnum
from services.arquivos.arquivos_service import ArquivosService
from shared.exceptions import ConflitoError, EtapaInvalidaError, NaoEncontradoError

EMAIL = "ana@example.com"
REF = {"nome": "a.pdf", "tipo": "application/pdf", "tamanho": 1, "caminho": "x/6/a.pdf"}


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
async def test_registrar_grava_referencia_e_auditoria(async_db, criar):
    await criar()

    await ArquivosService(async_db).registrar(EMAIL, 6, [REF])

    q = await async_db.get(Questionario, EMAIL)
    assert q.json_questionario["6"]["arquivos"] == [REF]
    assert q.atualizado_por == EMAIL
    assert q.atualizado_em is not None


@pytest.mark.asyncio
async def test_registrar_o_mesmo_caminho_substitui(async_db, criar):
    await criar()
    servico = ArquivosService(async_db)

    await servico.registrar(EMAIL, 6, [REF])
    await servico.registrar(EMAIL, 6, [{**REF, "tamanho": 7}])

    q = await async_db.get(Questionario, EMAIL)
    assert [a["tamanho"] for a in q.json_questionario["6"]["arquivos"]] == [7]


@pytest.mark.asyncio
async def test_remover_tira_a_referencia(async_db, criar):
    await criar(json={"6": {"arquivos": [REF]}})

    await ArquivosService(async_db).remover(EMAIL, 6, ["a.pdf"])

    q = await async_db.get(Questionario, EMAIL)
    assert q.json_questionario["6"]["arquivos"] == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status", [StatusEnum.iniciado, StatusEnum.pendente, StatusEnum.aprovado]
)
async def test_estados_editaveis(async_db, criar, status):
    await criar(status)
    assert await ArquivosService(async_db).verificar_edicao(EMAIL, 6)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status", [StatusEnum.aguardando_aprovacao, StatusEnum.rejeitado]
)
async def test_estados_nao_editaveis_da_conflito(async_db, criar, status):
    await criar(status)
    with pytest.raises(ConflitoError):
        await ArquivosService(async_db).verificar_edicao(EMAIL, 6)
    with pytest.raises(ConflitoError):
        await ArquivosService(async_db).registrar(EMAIL, 6, [REF])


@pytest.mark.asyncio
async def test_sem_questionario_da_nao_encontrado(async_db):
    with pytest.raises(NaoEncontradoError):
        await ArquivosService(async_db).verificar_edicao(EMAIL, 6)


@pytest.mark.asyncio
async def test_etapa_inexistente_da_erro(async_db, criar):
    await criar()
    with pytest.raises(EtapaInvalidaError):
        await ArquivosService(async_db).verificar_edicao(EMAIL, 99)
