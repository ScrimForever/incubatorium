from types import SimpleNamespace

import pytest

from domain.models import user_model


@pytest.mark.asyncio
async def test_verificacao_de_email_loga_sem_vazar_o_token(monkeypatch, capsys):
    registros = []
    monkeypatch.setattr(user_model.logger, "info", registros.append)
    gerenciador = user_model.UserManager(user_db=None)
    usuario = SimpleNamespace(id="u-1")

    await gerenciador.on_after_request_verify(usuario, "TOKEN-SECRETO")

    assert capsys.readouterr().out == ""  # nada de print
    assert registros and "u-1" in registros[0]
    assert "TOKEN-SECRETO" not in registros[0]
