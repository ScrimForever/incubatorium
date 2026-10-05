# Implementation Plan: Gestão de Incubação

**Branch**: `001-gestao-incubacao` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-gestao-incubacao/spec.md`

## Summary

Estender a API existente (FastAPI + SQLAlchemy async + fastapi-users) para cobrir o ciclo de
incubação: o **questionário já existente é o plano de negócio** , e sobre ele entram os usuários incubados (flag `is_incubado`) . A administração de contas pelo admin
fica adiada; a equipe é criada por script. Os perfis já existem como flags em `User` (`is_admin`,
`is_colaborador`, `is_consultor`, `is_incubado`). A estrutura das etapas é do frontend (não há tela nem lista no backend).
A abordagem reaproveita as camadas atuais e adiciona colunas novas via migrações Alembic.

## Technical Context

**Language/Version**: Python >= 3.12

**Primary Dependencies**: FastAPI, SQLAlchemy 2 (async), asyncpg, fastapi-users, Pydantic 2,
Alembic, Jinja2 + Resend (e-mail), loguru, aiofiles

**Storage**: PostgreSQL (JSONB para respostas do questionário); arquivos de anexo no disco
(`questionarios/<email>/<aba>/`)

**Testing**: pytest + pytest-asyncio, SQLite em memória (aiosqlite) para unitários; locust para
carga

**Target Platform**: Linux server (docker compose); consumidor da API: frontend Angular em
`../frontend`

**Project Type**: web-service (API REST)

**Performance Goals**: operações comuns de leitura/escrita respondem em < 1 s percebido; a visão
consolidada do colaborador (SC-005) carrega em < 3 s com até 500 incubados

**Operação**: e-mails novos controlados por `EMAIL_ENVIO_HABILITADO` e `EMAIL_DESTINO_OVERRIDE` (ver research §10).

**Constraints**: constituição v1.0.0 (camadas, async, testes, Alembic); nenhum perfil edita
etapas pela aplicação; histórico nunca é apagado

**Scale/Scope**: uma incubadora; ordem de centenas de incubados, dezenas de consultores; ~5–10
etapas por questionário

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação | Situação |
|-----------|-----------|----------|
| I. Camadas | Código novo segue router → service → repository. Os routers atuais chamam repository direto; não serão refatorados nesta feature, mas rotas novas MUST passar por service. | Pass |
| II. Assíncrono e tipado | Todo código novo é async com schemas Pydantic. | Pass |
| III. Testes | Cada story traz testes unitários; matriz de permissões por perfil com testes dedicados. | Pass |
| IV. Migrações | O repositório **não tem diretório Alembic**; o esquema hoje nasce de `create_all` na subida. Esta feature MUST introduzir Alembic (baseline + migrações novas) e remover `create_all`. | Pass após tarefa T0 (ver Complexity Tracking) |
| V. Observabilidade/simplicidade | `loguru` e `shared/exceptions` para erros de negócio; sem filas ou serviços novos. | Pass |

**Re-check pós-design (Phase 1)**: Pass. Nenhum princípio violado; ver Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-gestao-incubacao/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── api.md
└── tasks.md             # gerado por /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── models/
│   │   ├── questionarios/
│   │   │   └── questionario.py          # existente (+ campos de decisão)
│   └── schemas/                         # um schema por agregado novo
├── repository/                          # um repositório por agregado novo
├── services/
│   ├── usuarios/
│   └── email/                           # templates novos em templates/html
├── routers/
│   ├── usuarios/
│   └── (existentes: users, questionario, arquivos)
├── shared/exceptions/                   # exceções de negócio novas
├── shared/permissoes.py                 # dependências por perfil (admin, colaborador...)
├── migrations/                          # novo: Alembic
└── tests/unit/                          # espelha as camadas
```

**Structure Decision**: manter o layout em camadas já existente em `src/` (Princípio I), um
módulo por agregado, sem criar projeto ou pacote novo. O frontend é consumidor e fica fora
deste plano.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Introduzir Alembic agora (gap, não violação nova) | Princípio IV exige migração versionada, e a feature adiciona colunas novas em `user` e `questionario` | Manter `create_all` não evolui tabelas existentes (ex.: novos campos em `questionario`) e viola o princípio |
