"""Rede de segurança: congela as rotas públicas (path, método) da API."""

from startapp import app

ROTAS_CONGELADAS = {
    ("/arquivos/questionario/download/{aba}/{todos}", "POST"),
    ("/arquivos/questionario/nome-arquivo/{aba}", "GET"),
    ("/arquivos/questionario/{aba}", "DELETE"),
    ("/arquivos/questionario/{aba}", "POST"),
    ("/auth/forgot-password", "POST"),
    ("/auth/jwt/login", "POST"),
    ("/auth/jwt/logout", "POST"),
    ("/auth/register", "POST"),
    ("/auth/request-verify-token", "POST"),
    ("/auth/reset-password", "POST"),
    ("/auth/verify", "POST"),
    ("/authenticated-route", "GET"),
    ("/questionario", "GET"),
    ("/questionario", "POST"),
    ("/questionario", "PUT"),
    ("/questionario/todos", "GET"),
    ("/reenviar_codigo/{email}", "POST"),
    ("/users/me", "GET"),
    ("/users/me", "PATCH"),
    ("/users/{id}", "DELETE"),
    ("/users/{id}", "GET"),
    ("/users/{id}", "PATCH"),
    ("/usuarios", "GET"),
    ("/usuarios/{email}/plano", "GET"),
    ("/usuarios/{email}/situacao", "PATCH"),
    ("/validar_email/{email}/{code}", "GET"),
}


async def test_rotas_publicas_nao_mudaram():
    async with app.router.lifespan_context(app):
        paths = app.openapi()["paths"]
    atuais = {(p, m.upper()) for p, d in paths.items() for m in d}
    assert atuais == ROTAS_CONGELADAS
