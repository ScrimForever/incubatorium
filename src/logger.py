import sys
from pathlib import Path

from loguru import logger

LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)

logger.remove()

LOG_FORMAT_FILE = (
    "{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} | {message}"
)

LOG_FORMAT_CONSOLE = (
    "<green>{time:HH:mm:ss}</green> | "
    "<level>{level: <8}</level> | "
    "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
    "<level>{message}</level>"
)

logger.add(
    LOG_DIR / "app_{time:YYYY-MM-DD}.log",
    format=LOG_FORMAT_FILE,
    level="DEBUG",
    rotation="5 MB",
    retention="7 days",
    compression="zip",
    encoding="utf-8",
    backtrace=True,
    diagnose=True,
)

logger.add(
    sys.stderr,
    format=LOG_FORMAT_CONSOLE,
    level="INFO",
    colorize=True,
)

__all__ = ["logger"]
