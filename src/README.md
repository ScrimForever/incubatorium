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

## Migrações do banco (Alembic)

O esquema do banco é versionado com Alembic em `src/migrations/`. O serviço `web` roda
`alembic upgrade head` antes de subir a API.

Fora do docker, a partir de `src/` e com o banco acessível em `127.0.0.1`:

```bash
ALEMBIC_FORCE_LOCAL=1 uv run alembic upgrade head
ALEMBIC_FORCE_LOCAL=1 uv run alembic revision --autogenerate -m "descrição"
```

Bancos que já existiam (criados antes do Alembic) mantêm suas tabelas: a migração baseline
`0001` só cria o que falta e carimba a revisão.


## Perfis e criação da equipe

Há quatro perfis, definidos por flags em `User`: **incubado** (`is_incubado`, o padrão de quem
se cadastra), **consultor**, **colaborador** e **admin**. Quem se cadastra por `/auth/register`
é sempre incubado; a conta nasce inativa e ativa pelo link enviado por e-mail.

A equipe (admin, colaborador, consultor) é criada por script, a partir de `src/`:

```bash
python -m src.scripts.criar_admin --perfil admin --email admin@x.com --password '...'
python -m src.scripts.criar_admin --perfil colaborador --email colab@x.com --password '...'
python -m src.scripts.criar_admin --perfil consultor --email cons@x.com --password '...'
```

Para o admin inicial dá para usar `ADMIN_EMAIL` e `ADMIN_PASSWORD` no ambiente e omitir
`--email/--password`. O script é idempotente e ativa a conta diretamente. (Endpoints de
administração de contas pelo admin foram adiados.)

## Principais rotas

Detalhes em `specs/001-gestao-incubacao/contracts/api.md`; a documentação interativa fica em
`/docs`.

| Área | Rotas |
|---|---|
| Questionário (incubado) | `POST /questionario`, `GET /questionario`, `PUT /questionario` (grava as respostas, sem alterar o status) |
| Etapas | `GET /etapas` (as 9 etapas do questionário, definidas em código; `avaliavel=false` na etapa 1) |
| Plano e avaliações | `GET /usuarios/{email}/plano`, `PUT /usuarios/{email}/avaliacoes/{etapa_id}` (consultor), `GET /usuarios/{email}/avaliacoes` |
| Gestão (colaborador) | `GET /usuarios?perfil=incubado&situacao=`, `PATCH /usuarios/{email}/situacao` |
| Anexos | `POST /arquivos/questionario/{aba}` (valida tipo, conteúdo e tamanho), `GET /arquivos/questionario/nome-arquivo/{aba}?email=` |

Regras que valem a pena conhecer:

- A etapa 1 (Setor de atuação) não tem nota: avaliá-la devolve 422. A nota de cada etapa de 2 a 9 fica em `json_questionario[etapa].nota` (`valor` de 1 a 5, `texto`,
  `avaliador`, `avaliado_em`). O incubado nunca a altera ao salvar suas respostas.
- E-mails novos (nova avaliação) saem em qualquer ambiente com
  `RESEND_API_KEY`; `EMAIL_ENVIO_HABILITADO=false` desliga o envio e `EMAIL_DESTINO_OVERRIDE`
  redireciona tudo para um endereço de teste.
- Anexos entram só por `POST /arquivos/questionario/{aba}` (multipart); o JSON do questionário guarda
  a referência (`caminho`) em `arquivos[]` da etapa, e `DELETE` remove arquivo e referência. Base64 no
  JSON é recusado.
- `UPLOAD_TAMANHO_MAXIMO_MB` (padrão 10) limita os anexos.

## Testes de carga

```bash
LOCUST_COLABORADOR_EMAIL=... LOCUST_COLABORADOR_SENHA=... \
LOCUST_INCUBADO_EMAIL=... LOCUST_INCUBADO_SENHA=... \
uv run locust -f locust_test/locustfile.py --host http://localhost:8000
```
