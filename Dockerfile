FROM python:3.14-slim

# Instala o uv copiando o binário da imagem oficial
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# Dependências de sistema (ajuste conforme sua stack)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

# Copia apenas os arquivos de dependência primeiro (melhor cache de camadas)
COPY src/pyproject.toml src/uv.lock ./src/
WORKDIR /app/src
RUN uv sync --frozen --no-install-project

# Copia o resto do projeto
WORKDIR /app
COPY . .
WORKDIR /app/src
RUN uv sync --frozen

ENV PATH="/app/src/.venv/bin:$PATH"

EXPOSE 8000

CMD ["uv", "run", "fastapi", "dev", "startapp.py", "--host", "0.0.0.0", "--port", "8000"]