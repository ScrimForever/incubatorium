"""SC-004 e constituição: nenhuma rota nova sem login, e nenhum acesso a dados alheios."""

import re

import httpx
import pytest
from fastapi import FastAPI

from domain.models.enums import SituacaoIncubacao
from domain.models.questionarios.questionario import Questionario, StatusEnum
from routers.arquivos.r_arquivos import ArquivosRouter
from routers.avaliacoes.r_avaliacoes import router as avaliacoes_router
from routers.ingresso.r_ingresso import router as ingresso_router
from routers.usuarios.r_usuarios import router as usuarios_router
from shared.handlers import registrar_handlers

ROUTERS = [
    ingresso_router,
    usuarios_router,
    avaliacoes_router,
]


async def _app_com_todas_as_rotas() -> FastAPI:
    app = FastAPI()
    registrar_handlers(app)
    for router in ROUTERS:
        app.include_router(router)
    await ArquivosRouter(app).iniciar()
    return app


def _rotas(app: FastAPI):
    """Todas as rotas expostas, lidas do OpenAPI (inclui as de routers incluídos)."""
    for caminho, operacoes in app.openapi()["paths"].items():
        for metodo in operacoes:
            if metodo.upper() in ("GET", "POST", "PUT", "PATCH", "DELETE"):
                yield metodo.upper(), re.sub(r"\{[^}]+\}", "1", caminho)


@pytest.mark.asyncio
async def test_toda_rota_nova_exige_autenticacao():
    app = await _app_com_todas_as_rotas()
    rotas = sorted(set(_rotas(app)))
    assert len(rotas) >= 16  # garante que a varredura enxergou os routers

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as cliente:
        sem_login = {
            (metodo, caminho): (await cliente.request(metodo, caminho)).status_code
            for metodo, caminho in rotas
        }

    liberadas = {rota: codigo for rota, codigo in sem_login.items() if codigo != 401}
    assert liberadas == {}, f"rotas acessíveis sem login: {liberadas}"


@pytest.fixture
async def cenario(async_db, criar_usuario):
    """Dois incubados aprovados com dados próprios."""
    donos = []
    for email in ("ana@example.com", "beto@example.com"):
        usuario = await criar_usuario("incubado", email)
        async_db.add(
            Questionario(
                usuario_email=email,
                status_questionario=StatusEnum.aprovado,
                json_questionario={"2": {"business_canvas": "Canvas"}},
                criado_por=email,
            )
        )
        usuario.situacao_incubacao = SituacaoIncubacao.ativo
        donos.append(usuario)
    await async_db.commit()
    return {"ana": donos[0], "beto": donos[1]}


def _leituras_e_escritas_de_ana():
    corpo_nota = {"nota": 5, "parecer": "x"}
    return [
        ("GET", "/usuarios/ana@example.com/plano", None),
        ("GET", "/usuarios/ana@example.com/avaliacoes", None),
        ("GET", "/ingresso/ana@example.com/historico", None),
        ("PUT", "/usuarios/ana@example.com/avaliacoes/2", corpo_nota),
        ("GET", "/arquivos/questionario/nome-arquivo/6?email=ana@example.com", None),
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("intruso", ["beto"])
async def test_ninguem_acessa_dados_de_outro_incubado(
    async_db, cenario, criar_usuario, intruso
):
    app = await _app_com_todas_as_rotas()
    usuario = cenario[intruso]

    from domain.models.user_model import current_active_user
    from infra.db import get_async_session

    async def _usuario():
        return usuario

    async def _sessao():
        return async_db

    app.dependency_overrides[current_active_user] = _usuario
    app.dependency_overrides[get_async_session] = _sessao
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as cliente:
        for metodo, caminho, corpo in _leituras_e_escritas_de_ana():
            resposta = await cliente.request(metodo, caminho, json=corpo)
            assert resposta.status_code == 403, (
                f"{metodo} {caminho} -> {resposta.status_code}"
            )
