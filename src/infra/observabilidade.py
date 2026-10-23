"""Observabilidade via OpenTelemetry, exportando traces, métricas e logs por OTLP/gRPC
para o SigNoz (self-hosted ou cloud). Desligada por padrão (`OTEL_HABILITADO=false`)."""

import logging

from fastapi import FastAPI
from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.asyncpg import AsyncPGInstrumentor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from sqlalchemy.ext.asyncio import AsyncEngine
from src.infra.config import Settings
from src.infra.instrumentacao import instalar
from src.logger import logger


def _headers(bruto: str) -> dict[str, str]:
    """`chave=valor,chave2=valor2` -> dict (ex.: `signoz-ingestion-key=...` no SigNoz Cloud)."""
    pares = (item.split("=", 1) for item in bruto.split(",") if "=" in item)
    return {k.strip(): v.strip() for k, v in pares}


def configurar_observabilidade(
    app: FastAPI, engine: AsyncEngine, settings: Settings
) -> None:
    if not settings.otel_habilitado:
        return

    opcoes = {
        "endpoint": settings.otel_exporter_otlp_endpoint,
        "headers": _headers(settings.otel_exporter_otlp_headers),
    }
    recurso = Resource.create(
        {
            "service.name": settings.otel_service_name,
            "deployment.environment": settings.enviroment,
        }
    )

    tracer_provider = TracerProvider(resource=recurso)
    tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(**opcoes)))
    trace.set_tracer_provider(tracer_provider)

    metrics.set_meter_provider(
        MeterProvider(
            resource=recurso,
            metric_readers=[
                PeriodicExportingMetricReader(OTLPMetricExporter(**opcoes))
            ],
        )
    )

    logger_provider = LoggerProvider(resource=recurso)
    logger_provider.add_log_record_processor(
        BatchLogRecordProcessor(OTLPLogExporter(**opcoes))
    )
    handler = LoggingHandler(logger_provider=logger_provider)
    _enviar_logs_do_loguru(handler)
    _enviar_logs_do_uvicorn(handler)

    FastAPIInstrumentor.instrument_app(app)
    SQLAlchemyInstrumentor().instrument(engine=engine.sync_engine)
    AsyncPGInstrumentor().instrument()
    if settings.otel_rastrear_funcoes:
        total = instalar(tracer_provider.get_tracer("incubatorium.funcoes"))
        logger.info(f"Rastreamento de funções ativo: {total} funções")
    logger.info(
        f"Observabilidade ativa: {settings.otel_service_name} -> "
        f"{settings.otel_exporter_otlp_endpoint}"
    )


def _enviar_logs_do_uvicorn(handler: logging.Handler) -> None:
    """Logs de acesso (`POST /auth/jwt/login 200`) e de servidor vêm do `logging` padrão, não do
    loguru; os loggers do uvicorn não propagam para o root, então recebem o handler direto."""
    for nome in ("uvicorn.access", "uvicorn.error"):
        logging.getLogger(nome).addHandler(handler)


def _enviar_logs_do_loguru(handler: logging.Handler) -> None:
    """Cada log do loguru vira um registro OTLP, já com o trace/span ativo (correlação)."""

    def sink(mensagem) -> None:
        r = mensagem.record
        registro = logging.LogRecord(
            name=r["name"] or "app",
            level=r["level"].no,
            pathname=str(r["file"].path),
            lineno=r["line"],
            msg=r["message"],
            args=(),
            exc_info=(
                (r["exception"].type, r["exception"].value, r["exception"].traceback)
                if r["exception"]
                else None
            ),
            func=r["function"],
        )
        # `logger.bind(...)` vira atributo do log (filtrável no SigNoz)
        registro.__dict__.update(r["extra"])
        handler.emit(registro)

    logger.add(sink, level="INFO", format="{message}")
