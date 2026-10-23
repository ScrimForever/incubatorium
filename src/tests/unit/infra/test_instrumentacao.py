import sys
import types

import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from src.infra import instrumentacao

MODULO = "src._fake_instrumentado"


@pytest.fixture
def spans():
    modulo = types.ModuleType(MODULO)
    codigo = """
async def interna(valor):
    dobro = valor * 2
    return dobro

async def externa(email, senha):
    resultado = await interna(21)
    parcial = {"email": email, "token": "xyz"}
    return resultado

def falha(x):
    raise ValueError("boom")
"""
    arquivo = f"{instrumentacao._RAIZ}/_fake_instrumentado.py"
    # módulo fake só para o teste; o arquivo precisa estar sob a raiz do projeto
    exec(compile(codigo, arquivo, "exec"), modulo.__dict__)  # noqa: S102
    for f in vars(modulo).values():
        if isinstance(f, types.FunctionType):
            f.__module__ = MODULO
    sys.modules[MODULO] = modulo
    exportador = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exportador))
    assert instrumentacao.instalar(provider.get_tracer("t"), MODULO) == 3
    yield modulo, exportador
    instrumentacao.desinstalar()
    del sys.modules[MODULO]


@pytest.mark.asyncio
async def test_span_por_funcao_com_args_locais_e_retorno(spans):
    modulo, exportador = spans

    assert await modulo.externa("a@x.com", "segredo123") == 42

    por_nome = {s.name: s for s in exportador.get_finished_spans()}
    externa = por_nome[f"{MODULO}.externa"]
    interna = por_nome[f"{MODULO}.interna"]
    assert interna.parent.span_id == externa.context.span_id  # aninhamento
    assert externa.attributes["code.args.email"] == "a@x.com"
    assert externa.attributes["code.args.senha"] == "***"
    assert externa.attributes["code.vars.resultado"] == "42"
    assert "'token': '***'" in externa.attributes["code.vars.parcial"]
    assert interna.attributes["code.args.valor"] == "21"
    assert interna.attributes["code.vars.dobro"] == "42"
    assert interna.attributes["code.return"] == "42"
    assert interna.end_time >= interna.start_time


def test_excecao_marca_span_com_erro(spans):
    modulo, exportador = spans

    with pytest.raises(ValueError):
        modulo.falha(1)

    (span,) = exportador.get_finished_spans()
    assert span.status.status_code.name == "ERROR"
    assert span.attributes["code.args.x"] == "1"
