import pytest
from sqlalchemy import select

from src.domain.models.questionario import (
    Questionario,
    QuestionarioAvaliador,
    StatusEnum,
)
from src.routers.selecao_avaliadores import router


async def _questionario(async_db, email="incubado@example.com") -> Questionario:
    questionario = Questionario(
        usuario_email=email,
        status_questionario=StatusEnum.pendente,
        json_questionario={},
        criado_por=email,
    )
    async_db.add(questionario)
    await async_db.commit()
    return questionario


async def _avaliadores_gravados(async_db, questionario_id: int) -> list[str]:
    resultado = await async_db.execute(
        select(QuestionarioAvaliador.avaliador_email)
        .where(QuestionarioAvaliador.questionario_id == questionario_id)
        .order_by(QuestionarioAvaliador.avaliador_email)
    )
    return list(resultado.scalars().all())


@pytest.mark.asyncio
@pytest.mark.parametrize("perfil", ["consultor", "incubado", "colaborador"])
async def test_so_admin_seleciona(perfil, criar_usuario, cliente_api, async_db):
    solicitante = await criar_usuario(perfil)
    questionario = await _questionario(async_db)
    cliente = await cliente_api([router], solicitante)

    resposta = await cliente.post(
        "/questionario-selecionado-avaliadores",
        json={"questionario_id": questionario.id, "avaliadores": []},
    )

    assert resposta.status_code == 403


@pytest.mark.asyncio
async def test_seleciona_consultores_e_grava(criar_usuario, cliente_api, async_db):
    solicitante = await criar_usuario("admin")
    await criar_usuario("consultor", "c1@example.com")
    await criar_usuario("consultor", "c2@example.com")
    questionario = await _questionario(async_db)
    cliente = await cliente_api([router], solicitante)

    resposta = await cliente.post(
        "/questionario-selecionado-avaliadores",
        json={
            "questionario_id": questionario.id,
            "avaliadores": ["c2@example.com", "c1@example.com"],
        },
    )

    assert resposta.status_code == 201
    assert resposta.json() == {
        "questionario_id": questionario.id,
        "avaliadores": ["c2@example.com", "c1@example.com"],
    }
    assert await _avaliadores_gravados(async_db, questionario.id) == [
        "c1@example.com",
        "c2@example.com",
    ]
    await async_db.refresh(questionario)
    assert questionario.avaliado_admin is True


@pytest.mark.asyncio
async def test_recusa_emails_que_nao_sao_consultores(
    criar_usuario, cliente_api, async_db
):
    admin = await criar_usuario("admin")
    await criar_usuario("consultor", "c1@example.com")
    await criar_usuario("colaborador", "colab@example.com")
    questionario = await _questionario(async_db)
    cliente = await cliente_api([router], admin)

    resposta = await cliente.post(
        "/questionario-selecionado-avaliadores",
        json={
            "questionario_id": questionario.id,
            "avaliadores": [
                "c1@example.com",
                "colab@example.com",
                "ninguem@example.com",
            ],
        },
    )

    assert resposta.status_code == 422
    assert resposta.json() == {
        "mensagem": "Existem e-mails não avaliadores na solicitação: "
        "colab@example.com, ninguem@example.com"
    }
    assert await _avaliadores_gravados(async_db, questionario.id) == []


@pytest.mark.asyncio
async def test_questionario_inexistente_devolve_404(criar_usuario, cliente_api):
    admin = await criar_usuario("admin")
    await criar_usuario("consultor", "c1@example.com")
    cliente = await cliente_api([router], admin)

    resposta = await cliente.post(
        "/questionario-selecionado-avaliadores",
        json={"questionario_id": 999999, "avaliadores": ["c1@example.com"]},
    )

    assert resposta.status_code == 404
    assert resposta.json() == {"mensagem": "Questionário não encontrado."}


@pytest.mark.asyncio
async def test_nova_selecao_substitui_a_anterior_e_ignora_repetidos(
    criar_usuario, cliente_api, async_db
):
    admin = await criar_usuario("admin")
    await criar_usuario("consultor", "c1@example.com")
    await criar_usuario("consultor", "c2@example.com")
    questionario = await _questionario(async_db)
    cliente = await cliente_api([router], admin)
    url = "/questionario-selecionado-avaliadores"

    await cliente.post(
        url,
        json={"questionario_id": questionario.id, "avaliadores": ["c1@example.com"]},
    )
    resposta = await cliente.post(
        url,
        json={
            "questionario_id": questionario.id,
            "avaliadores": ["c2@example.com", "c2@example.com"],
        },
    )

    assert resposta.status_code == 201
    assert resposta.json()["avaliadores"] == ["c2@example.com"]
    assert await _avaliadores_gravados(async_db, questionario.id) == ["c2@example.com"]


@pytest.mark.asyncio
async def test_lista_vazia_e_email_invalido_sao_422(
    criar_usuario, cliente_api, async_db
):
    admin = await criar_usuario("admin")
    questionario = await _questionario(async_db)
    cliente = await cliente_api([router], admin)
    url = "/questionario-selecionado-avaliadores"

    vazia = await cliente.post(
        url, json={"questionario_id": questionario.id, "avaliadores": []}
    )
    invalido = await cliente.post(
        url, json={"questionario_id": questionario.id, "avaliadores": ["nao-e-email"]}
    )

    assert vazia.status_code == 422
    assert invalido.status_code == 422
