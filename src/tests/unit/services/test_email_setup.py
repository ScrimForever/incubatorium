import pytest

from infra.config import settings
from services.email import setup
from services.email.setup import EmailSetup


@pytest.fixture
def enviados(monkeypatch):
    chamadas = []
    monkeypatch.setattr(
        setup.resend.Emails, "send", lambda params: chamadas.append(params)
    )
    monkeypatch.setattr(settings, "resend_api_key", "re_chave_de_teste")
    monkeypatch.setattr(settings, "email_envio_habilitado", True)
    monkeypatch.setattr(settings, "email_destino_override", "")
    return chamadas


class TestEnviarNotificacao:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("ambiente", ["development", "production", "staging"])
    async def test_envia_em_qualquer_ambiente(self, enviados, monkeypatch, ambiente):
        monkeypatch.setattr(settings, "enviroment", ambiente)

        ok = await EmailSetup().enviar_notificacao(
            "ana@x.com", "Assunto", "Título", "Msg"
        )

        assert ok is True
        assert enviados[0]["to"] == "ana@x.com"
        assert enviados[0]["subject"].endswith("Assunto")
        assert "Título" in enviados[0]["html"]

    @pytest.mark.asyncio
    async def test_desabilitado_nao_envia(self, enviados, monkeypatch):
        monkeypatch.setattr(settings, "email_envio_habilitado", False)

        assert await EmailSetup().enviar_notificacao("a@x.com", "A", "T", "M") is False
        assert enviados == []

    @pytest.mark.asyncio
    async def test_sem_chave_de_api_nao_envia(self, enviados, monkeypatch):
        monkeypatch.setattr(settings, "resend_api_key", "")

        assert await EmailSetup().enviar_notificacao("a@x.com", "A", "T", "M") is False
        assert enviados == []

    @pytest.mark.asyncio
    async def test_erro_do_resend_devolve_false(self, monkeypatch):
        monkeypatch.setattr(settings, "resend_api_key", "re_chave_de_teste")
        monkeypatch.setattr(settings, "email_envio_habilitado", True)

        def _falha(params):
            raise setup.ResendError(
                code=500, error_type="x", message="falhou", suggested_action=""
            )

        monkeypatch.setattr(setup.resend.Emails, "send", _falha)

        assert await EmailSetup().enviar_notificacao("a@x.com", "A", "T", "M") is False

    @pytest.mark.asyncio
    async def test_override_redireciona_o_destinatario(self, enviados, monkeypatch):
        monkeypatch.setattr(settings, "email_destino_override", "teste@interno.com")

        await EmailSetup().enviar_notificacao("ana@x.com", "A", "T", "M")

        assert enviados[0]["to"] == "teste@interno.com"

    @pytest.mark.asyncio
    async def test_decisao_rejeitada_leva_o_motivo(self, enviados):
        await EmailSetup().enviar_email_decisao_ingresso(
            "ana@x.com", False, "Faltou o canvas"
        )

        assert "Faltou o canvas" in enviados[0]["html"]
