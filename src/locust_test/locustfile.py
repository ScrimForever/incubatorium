"""Cenários de carga.

Credenciais por variável de ambiente (contas já criadas e ativas):

    LOCUST_COLABORADOR_EMAIL / LOCUST_COLABORADOR_SENHA
    LOCUST_INCUBADO_EMAIL    / LOCUST_INCUBADO_SENHA   (incubado aprovado)

    locust -f locust_test/locustfile.py --host http://localhost:8000
"""

import os

from locust import HttpUser, between, task


class Teste(HttpUser):
    @task
    def test_questionario(self):
        self.client.get("/questionario/teste")


class UsuarioAutenticado(HttpUser):
    abstract = True
    wait_time = between(1, 3)
    prefixo_env = ""

    def on_start(self):
        email = os.getenv(f"LOCUST_{self.prefixo_env}_EMAIL")
        senha = os.getenv(f"LOCUST_{self.prefixo_env}_SENHA")
        if not email or not senha:
            self.stop()
            return
        self.email = email
        resposta = self.client.post(
            "/auth/jwt/login", data={"username": email, "password": senha}
        )
        resposta.raise_for_status()
        self.client.headers["Authorization"] = (
            f"Bearer {resposta.json()['access_token']}"
        )


class ColaboradorPainel(UsuarioAutenticado):
    """Rota crítica: painel consolidado de incubados (alvo < 3 s com 500)."""

    prefixo_env = "COLABORADOR"

    @task(5)
    def painel(self):
        self.client.get("/usuarios?perfil=incubado", name="/usuarios?perfil=incubado")


class IncubadoPlano(UsuarioAutenticado):
    prefixo_env = "INCUBADO"

    @task(3)
    def meu_plano(self):
        self.client.get("/questionario")

    @task(1)
    def minhas_avaliacoes(self):
        self.client.get(
            f"/usuarios/{self.email}/avaliacoes", name="/usuarios/{email}/avaliacoes"
        )
