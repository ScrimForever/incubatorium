# Quickstart: validar a Gestão de Incubação

Pré-requisitos: `src/.env.development` configurado; `docker compose up -d`; migrações aplicadas
(`uv run alembic upgrade head` a partir de `src/`); admin inicial criado
(`ADMIN_EMAIL`/`ADMIN_PASSWORD` + `uv run python -m src.scripts.criar_admin`).

Testes automatizados: `./run-tests.sh` (ou `docker compose run tests`).

## Roteiro de validação ponta a ponta

1. **Equipe**: criar admin, colaborador e consultor com `python -m src.scripts.criar_admin --perfil ...`;
   confirmar que um token de incubado recebe 403 nas rotas de colaborador (ex.: `PATCH /usuarios/{email}/situacao`).
2. **Ingresso (US1)**: registrar candidato (`/auth/register`), ativar e-mail, preencher
   `PUT /questionario`, `POST /ingresso/enviar`. Como colaborador, rejeitar com motivo; como
   candidato, `POST /ingresso/reiniciar`, reenviar; aprovar. Esperado: `GET /ingresso/{email}/historico` mostra o 1º questionário como `<email>_1` rejeitado e
   `GET /usuarios?perfil=incubado` lista o usuário com situação `ativo`.
3. **Plano (US2)**: como incubado aprovado, `PUT /questionario` com novas respostas mantém o status
   aprovado e não altera as notas; um anexo com conteúdo falso é recusado (422); um upload por `POST /arquivos/questionario/6` aparece em
   `GET /questionario` como referência com `caminho`, e o `DELETE` remove arquivo e referência.
4. **Avaliação (US3)**: consultor avalia a etapa 2 com nota 4 (avaliar a etapa 1 devolve 422: ela não tem nota) e
   parecer; incubado vê a avaliação (e o `PUT /questionario` dele não apaga a nota).  Incubado tentando avaliar recebe 403.

Critérios de aceite mapeiam para SC-001 a SC-007 do [spec](spec.md); contratos em
[contracts/api.md](contracts/api.md); entidades em [data-model.md](data-model.md).
