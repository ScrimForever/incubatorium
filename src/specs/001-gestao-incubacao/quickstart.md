# Quickstart: validar a Gestão de Incubação

Pré-requisitos: `src/.env.development` configurado; `docker compose up -d`; migrações aplicadas
(`uv run alembic upgrade head` a partir de `src/`); admin inicial criado
(`ADMIN_EMAIL`/`ADMIN_PASSWORD` + `uv run python -m src.scripts.criar_admin`).

Testes automatizados: `./run-tests.sh` (ou `docker compose run tests`).

## Roteiro de validação ponta a ponta

1. **Equipe**: criar admin, colaborador e consultor com `python -m src.scripts.criar_admin --perfil ...`;
   confirmar que um token de incubado recebe 403 nas rotas de colaborador (ex.: `PATCH /usuarios/{email}/situacao`).
2. **Questionário (US1)**: registrar candidato (`/auth/register`), ativar e-mail, preencher
   `PUT /questionario`. Esperado: `GET /questionario` devolve as respostas gravadas.
3. **Plano (US2)**: como incubado aprovado, `PUT /questionario` com novas respostas mantém o status
   aprovado sem alterar o status; um anexo com conteúdo falso é recusado (422); um upload por `POST /arquivos/questionario/6` aparece em
   `GET /questionario` como referência com `caminho`, e o `DELETE` remove arquivo e referência.

Critérios de aceite mapeiam para SC-001 a SC-006 do [spec](spec.md); contratos em
[contracts/api.md](contracts/api.md); entidades em [data-model.md](data-model.md).
