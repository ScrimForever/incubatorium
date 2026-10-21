import pytest
from sqlalchemy import select

from src.domain.models.questionario import (
    Questionario,
    QuestionarioHistorico,
)
from src.routers.questionario import router


async def _router():
    return router


@pytest.mark.asyncio
async def test_put_de_outro_usuario_nao_altera_questionario_alheio(
    async_db, criar_usuario, cliente_api
):
    dono = await criar_usuario("incubado")
    intruso = await criar_usuario("incubado")
    for u in (dono, intruso):
        async_db.add(
            Questionario(
                usuario_email=u.email,
                criado_por=u.email,
                status_questionario="iniciado",
                json_questionario={"de": u.email},
            )
        )
    await async_db.commit()

    cliente = await cliente_api([await _router()], intruso)
    # tenta apontar para o questionário do dono por todos os meios possíveis
    resposta = await cliente.put(
        f"/questionario?usuario_email={dono.email}&id=1",
        json={
            "status_questionario": "pendente",
            "json_questionario": {"invadido": True},
            "usuario_email": dono.email,
            "id": 1,
        },
        headers={"X-User-Email": dono.email},
    )
    assert resposta.status_code == 200

    linhas = (
        await async_db.execute(
            select(
                Questionario.id,
                Questionario.usuario_email,
                Questionario.json_questionario,
                Questionario.atualizado_por,
            ).execution_options(populate_existing=True)
        )
    ).all()
    q = {linha.usuario_email: linha for linha in linhas}
    assert q[dono.email].json_questionario == {"de": dono.email}
    assert q[dono.email].atualizado_por is None
    assert q[intruso.email].json_questionario == {"invadido": True}

    hist = (
        await async_db.execute(
            select(
                QuestionarioHistorico.questionario_id,
                QuestionarioHistorico.usuario_email,
            )
        )
    ).all()
    assert [tuple(h) for h in hist] == [(q[intruso.email].id, intruso.email)]
