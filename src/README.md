# Incubatorium

## Como subir o projeto

Certifique-se de ter o arquivo `src/.env.development` configurado antes de continuar.

Para subir os containers (API + banco de dados):

```bash
docker compose up
```

Para subir em segundo plano (sem travar o terminal):

```bash
docker compose up -d
```

A aplicação ficará disponível em:

- API: http://localhost:8000
- Documentação (Swagger): http://localhost:8000/docs

## Como parar o projeto

```bash
docker compose down
```

Isso para e remove os containers, mas mantém os dados do banco (volume `postgres_data`).

Se quiser apagar também os dados do banco:

```bash
docker compose down -v
```

## Rebuild

Se você alterar o `Dockerfile`, `pyproject.toml` ou `uv.lock`, é necessário reconstruir a imagem:

```bash
docker compose up --build
```