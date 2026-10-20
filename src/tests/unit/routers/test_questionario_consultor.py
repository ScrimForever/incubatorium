"""PUT /questionario/{id}: o consultor edita o questionário de um incubado."""

import pytest
from sqlalchemy import select

from domain.models.questionario import Questionario, QuestionarioHistorico, StatusEnum
from routers.questionario import router


@pytest.fixture
async def questionario_do_incubado(async_db, criar_usuario):
    incubado = await criar_usuario("incubado", "inc@example.com")
    questionario = Questionario(
        usuario_email=incubado.email,
        status_questionario=StatusEnum.pendente,
        json_questionario={"1": "antes"},
        criado_por=incubado.email,
    )
    async_db.add(questionario)
    await async_db.commit()
    await async_db.refresh(questionario)
    return questionario


CORPO = {"status_questionario": "aprovado", "json_questionario": {"1": "depois"}}


@pytest.mark.asyncio
async def test_consultor_edita_e_assina_a_atualizacao(
    async_db, criar_usuario, cliente_api, questionario_do_incubado
):
    consultor = await criar_usuario("consultor")
    criado_em = questionario_do_incubado.criado_em
    cliente = await cliente_api([router], consultor)

    resposta = await cliente.put(
        f"/questionario/{questionario_do_incubado.id}", json=CORPO
    )

    assert resposta.status_code == 200
    await async_db.refresh(questionario_do_incubado)
    q = questionario_do_incubado
    assert q.json_questionario == {"1": "depois"}
    assert q.status_questionario == StatusEnum.aprovado
    assert q.atualizado_por == consultor.email
    assert q.atualizado_em is not None
    assert q.usuario_email == "inc@example.com"
    assert q.criado_por == "inc@example.com"
    assert q.criado_em == criado_em


@pytest.mark.asyncio
async def test_campos_protegidos_no_corpo_sao_ignorados(
    async_db, criar_usuario, cliente_api, questionario_do_incubado
):
    consultor = await criar_usuario("consultor")
    cliente = await cliente_api([router], consultor)
    corpo = {
        **CORPO,
        "usuario_email": "outro@example.com",
        "criado_por": "hacker",
        "criado_em": "2000-01-01T00:00:00Z",
    }

    resposta = await cliente.put(
        f"/questionario/{questionario_do_incubado.id}", json=corpo
    )

    assert resposta.status_code == 200
    await async_db.refresh(questionario_do_incubado)
    q = questionario_do_incubado
    assert q.usuario_email == "inc@example.com"
    assert q.criado_por == "inc@example.com"
    assert q.criado_em.year != 2000


@pytest.mark.asyncio
async def test_historico_pertence_ao_dono_do_questionario(
    async_db, criar_usuario, cliente_api, questionario_do_incubado
):
    consultor = await criar_usuario("consultor")
    cliente = await cliente_api([router], consultor)

    await cliente.put(f"/questionario/{questionario_do_incubado.id}", json=CORPO)

    historico = (await async_db.execute(select(QuestionarioHistorico))).scalars().all()
    assert [h.usuario_email for h in historico] == ["inc@example.com"]


@pytest.mark.asyncio
async def test_id_inexistente_devolve_404(criar_usuario, cliente_api):
    consultor = await criar_usuario("consultor")
    cliente = await cliente_api([router], consultor)

    resposta = await cliente.put("/questionario/9999", json=CORPO)

    assert resposta.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("perfil", ["incubado", "colaborador"])
async def test_outros_perfis_nao_usam_a_rota(
    perfil, criar_usuario, cliente_api, questionario_do_incubado
):
    usuario = await criar_usuario(perfil)
    cliente = await cliente_api([router], usuario)

    resposta = await cliente.put(
        f"/questionario/{questionario_do_incubado.id}", json=CORPO
    )

    assert resposta.status_code == 403


@pytest.mark.asyncio
async def test_admin_passa(criar_usuario, cliente_api, questionario_do_incubado):
    admin = await criar_usuario("admin")
    cliente = await cliente_api([router], admin)

    resposta = await cliente.put(
        f"/questionario/{questionario_do_incubado.id}", json=CORPO
    )

    assert resposta.status_code == 200
