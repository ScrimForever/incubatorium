from fastapi import FastAPI
from sqlalchemy.ext.asyncio import create_async_engine

from src.infra.config import Settings
from src.infra.observabilidade import _headers, configurar_observabilidade


def test_headers_converte_pares_chave_valor():
    assert _headers("signoz-ingestion-key=abc, x=y=z") == {
        "signoz-ingestion-key": "abc",
        "x": "y=z",
    }
    assert _headers("") == {}


def test_desabilitada_nao_instrumenta_nada():
    app = FastAPI()
    engine = create_async_engine("sqlite+aiosqlite://")

    configurar_observabilidade(app, engine, Settings(otel_habilitado=False))

    assert not getattr(app, "_is_instrumented_by_opentelemetry", False)
