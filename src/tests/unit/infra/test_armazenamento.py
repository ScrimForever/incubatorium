import hashlib

import pytest

from infra.armazenamento import ArmazenamentoLocal, sanitizar_email

EMAIL = "Ana@Example.com"


async def _partes(*blocos):
    for bloco in blocos:
        yield bloco


def test_pasta_usa_sha256_do_email_em_minusculas(tmp_path):
    esperado = hashlib.sha256(b"ana@example.com").hexdigest()
    assert sanitizar_email(EMAIL) == esperado
    assert ArmazenamentoLocal(tmp_path).pasta(EMAIL, 3) == tmp_path / esperado / "3"


def test_caminho_relativo(tmp_path):
    pasta = sanitizar_email(EMAIL)
    assert (
        ArmazenamentoLocal(tmp_path).caminho_relativo(EMAIL, 3, "a.pdf")
        == f"{pasta}/3/a.pdf"
    )


def test_listar_pasta_inexistente_devolve_vazio(tmp_path):
    assert ArmazenamentoLocal(tmp_path).listar(EMAIL, 1) == []


@pytest.mark.asyncio
async def test_gravar_cria_pasta_sob_demanda_e_devolve_bytes(tmp_path):
    armazenamento = ArmazenamentoLocal(tmp_path / "raiz")
    gravados = await armazenamento.gravar(EMAIL, 1, "a.txt", _partes(b"ab", b"cde"))
    assert gravados == 5
    assert armazenamento.listar(EMAIL, 1) == ["a.txt"]


@pytest.mark.asyncio
async def test_apagar_ignora_inexistentes(tmp_path):
    armazenamento = ArmazenamentoLocal(tmp_path)
    await armazenamento.gravar(EMAIL, 1, "a.txt", _partes(b"x"))
    armazenamento.apagar(EMAIL, 1, ["a.txt", "nao-existe.txt"])
    assert armazenamento.listar(EMAIL, 1) == []


@pytest.mark.asyncio
async def test_arquivar_copia_a_pasta_do_usuario(tmp_path):
    armazenamento = ArmazenamentoLocal(tmp_path)
    assert armazenamento.arquivar(EMAIL, 1) is False
    await armazenamento.gravar(EMAIL, 2, "a.txt", _partes(b"x"))
    assert armazenamento.arquivar(EMAIL, 1) is True
    copia = tmp_path / f"{sanitizar_email(EMAIL)}_1" / "2" / "a.txt"
    assert copia.read_bytes() == b"x"
