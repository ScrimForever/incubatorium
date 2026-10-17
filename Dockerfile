# ---- Stage 1: builder (instala apenas as dependências de produção no venv) ----
FROM python:3.14-alpine AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_DEV=1

WORKDIR /app/src

# Copia apenas os arquivos de dependência primeiro (melhor cache de camadas)
COPY src/pyproject.toml src/uv.lock ./
RUN uv sync --frozen --no-install-project

# Copia o código e instala o projeto
WORKDIR /app
COPY . .
WORKDIR /app/src
RUN uv sync --frozen


# ---- Stage 2: runtime (mínimo para rodar) ----
FROM python:3.14-alpine AS runtime

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Remove do Python o que não é usado em runtime (testes, IDLE, pip, setuptools)
RUN rm -rf /usr/local/lib/python3.14/test \
           /usr/local/lib/python3.14/idlelib \
           /usr/local/lib/python3.14/ensurepip \
           /usr/local/lib/python3.14/turtledemo \
           /usr/local/lib/python3.14/site-packages/pip* \
           /usr/local/lib/python3.14/site-packages/setuptools* \
           /usr/local/lib/python3.14/site-packages/wheel* \
           /usr/local/bin/pip* /usr/local/bin/idle* /usr/local/bin/pydoc*

# `uv run` não deve re-sincronizar nem instalar dependências de dev no start
ENV UV_NO_DEV=1 \
    UV_NO_SYNC=1

WORKDIR /app
COPY --from=builder /app /app

WORKDIR /app/src
ENV PATH="/app/src/.venv/bin:$PATH"

EXPOSE 8000

CMD ["uv", "run", "fastapi", "dev", "startapp.py", "--host", "0.0.0.0", "--port", "8000"]
