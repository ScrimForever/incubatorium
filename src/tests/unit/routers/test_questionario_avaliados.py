import pytest

from src.domain.models.questionario import (
    Questionario,
    QuestionarioAvaliador,
    StatusEnum,
)
from src.routers.questionario import router


async def _questionario(async_db, email: str, avaliado: bool) -> Questionario:
    questionario = Questionario(
        usuario_email=email,
        status_questionario=StatusEnum.pendente,
        json_questionario={},
        criado_por=email,
        avaliado_admin=avaliado,
    )
    async_db.add(questionario)
    await async_db.commit()
    return questionario


async def _selecionar(async_db, questionario: Questionario, avaliador: str) -> None:
    async_db.add(
        QuestionarioAvaliador(
            questionario_id=questionario.id, avaliador_email=avaliador, criado_por="adm"
        )
    )
    await async_db.commit()


@pytest.mark.asyncio
async def test_avaliador_ve_so_os_questionarios_avaliados_em_que_foi_selecionado(
    criar_usuario, cliente_api, async_db
):
    avaliador = await criar_usuario("consultor", "av@example.com")
    avaliado = await _questionario(async_db, "ana@example.com", avaliado=True)
    await _selecionar(async_db, avaliado, avaliador.email)
    # selecionado, mas ainda sem a flag do admin: não aparece
    nao_avaliado = await _questionario(async_db, "bia@example.com", avaliado=False)
    await _selecionar(async_db, nao_avaliado, avaliador.email)
    # flag ligada, mas o avaliador não foi selecionado: não aparece
    outro = await _questionario(async_db, "caio@example.com", avaliado=True)
    await _selecionar(async_db, outro, "outro@example.com")
    cliente = await cliente_api([router], avaliador)

    resposta = await cliente.get("/questionario/todos")

    assert resposta.status_code == 200
    assert [q["usuario_email"] for q in resposta.json()] == ["ana@example.com"]


@pytest.mark.asyncio
async def test_admin_recebe_todos_os_questionarios_inclusive_nao_avaliados(
    criar_usuario, cliente_api, async_db
):
    admin = await criar_usuario("admin", "adm@example.com")
    await _questionario(async_db, "ana@example.com", avaliado=True)
    await _questionario(async_db, "bia@example.com", avaliado=False)
    cliente = await cliente_api([router], admin)

    resposta = await cliente.get("/questionario/todos")

    assert resposta.status_code == 200
    assert sorted(q["usuario_email"] for q in resposta.json()) == [
        "ana@example.com",
        "bia@example.com",
    ]


@pytest.mark.asyncio
async def test_colaborador_sem_selecao_recebe_lista_vazia(
    criar_usuario, cliente_api, async_db
):
    colaborador = await criar_usuario("colaborador", "colab@example.com")
    avaliado = await _questionario(async_db, "ana@example.com", avaliado=True)
    await _selecionar(async_db, avaliado, "av@example.com")
    cliente = await cliente_api([router], colaborador)

    resposta = await cliente.get("/questionario/todos")

    assert resposta.status_code == 200
    assert resposta.json() == []


@pytest.mark.asyncio
async def test_questionario_novo_nasce_com_avaliado_admin_falso(
    criar_usuario, async_db
):
    await criar_usuario("incubado", "ana@example.com")
    questionario = await _questionario(async_db, "bia@example.com", avaliado=False)

    await async_db.refresh(questionario)
    assert questionario.avaliado_admin is False
