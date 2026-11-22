"""Erros e performance (traces) no Sentry. Desligado sem `SENTRY_DSN`.

FastAPI/Starlette e SQLAlchemy são instrumentados automaticamente pelo SDK; asyncpg e loguru
entram explicitamente. Logs do loguru: `INFO`+ vão para o Sentry Logs (e viram breadcrumbs) e
`ERROR`+ também viram eventos de erro. Métricas: `sentry_sdk.metrics.count/gauge/distribution`."""

import sentry_sdk
from sentry_sdk.integrations.asyncpg import AsyncPGIntegration
from sentry_sdk.integrations.loguru import LoggingLevels, LoguruIntegration
from src.infra.config import Settings
from src.logger import logger


def configurar_observabilidade(settings: Settings) -> bool:
    """Inicializa o Sentry; devolve `False` (e não faz nada) se não houver DSN."""
    if not settings.sentry_dsn:
        return False
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.enviroment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        profile_session_sample_rate=settings.sentry_profile_session_sample_rate,
        profile_lifecycle="trace",
        # sem IP, cookies e headers de auth; o e-mail do usuário vai por `set_user`
        send_default_pii=False,
        enable_logs=True,
        integrations=[
            AsyncPGIntegration(),
            LoguruIntegration(
                level=LoggingLevels.INFO.value,
                event_level=LoggingLevels.ERROR.value,
                sentry_logs_level=LoggingLevels.INFO.value,
            ),
        ],
    )
    logger.info(f"Sentry ativo (ambiente={settings.enviroment})")
    return True
