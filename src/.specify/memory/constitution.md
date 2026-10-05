<!--
Sync Impact Report
- Version change: (template não preenchido) → 1.0.0
- Princípios modificados: nenhum renomeado (adoção inicial; 5 princípios definidos)
- Seções adicionadas: Princípios Fundamentais (I–V), Restrições Técnicas,
  Fluxo de Desenvolvimento, Governança
- Seções removidas: nenhuma
- TODOs adiados: nenhum. Data de ratificação definida como a data desta adoção
  (2026-09-30), pois não há constituição anterior.
-->
# Incubatorium Constitution

## Princípios Fundamentais

### I. Arquitetura em Camadas
O código MUST seguir a separação existente: `routers` (HTTP) → `services` (regras de negócio)
→ `repository` (acesso a dados), com `domain` (models e schemas) e `shared` (exceções comuns)
como base. Routers MUST NOT acessar o banco diretamente; repositories MUST NOT conter regras de
negócio. Configuração e conexão ficam em `infra`.
Rationale: isolar responsabilidades torna cada camada testável e substituível.

### II. Assíncrono e Tipado
Endpoints, serviços e acesso a banco MUST usar `async`/`await` (FastAPI, SQLAlchemy async,
asyncpg). Entradas e saídas de API MUST ser validadas por schemas Pydantic. Segredos e
configurações MUST vir de variáveis de ambiente via `pydantic-settings`, nunca hardcoded.
Rationale: evita bloqueio do event loop e garante contratos explícitos.

### III. Testes Automatizados (NON-NEGOTIABLE)
Toda nova regra de negócio, rota ou correção de bug MUST vir acompanhada de testes `pytest`
em `tests/`. Testes unitários MUST rodar sem serviços externos (SQLite em memória via
`aiosqlite`, e-mail mockado). Arquivos de teste MUST usar UTF-8 e passar em
`tests/validate_imports.py`. Um PR com testes falhando MUST NOT ser integrado.
Rationale: o projeto já padronizou testes; regressões em fluxos de questionário e usuários
são caras.

### IV. Mudanças de Esquema via Migrações
Alterações em models persistidos MUST ser acompanhadas de uma migração Alembic versionada.
Alterações manuais no banco fora de migrações são proibidas.
Rationale: garante ambientes reproduzíveis (docker compose, teste, produção).

### V. Observabilidade e Simplicidade
Eventos relevantes e erros MUST ser registrados com `loguru` (`logger.py`); falhas esperadas
de negócio MUST usar as exceções de `shared/exceptions` e não `print` ou exceções genéricas.
Soluções MUST começar pela alternativa mais simples (YAGNI); complexidade adicional MUST ser
justificada no plano da feature.
Rationale: facilita diagnóstico e mantém a base pequena para a equipe.

## Restrições Técnicas

- Stack: Python >= 3.12, FastAPI, SQLAlchemy 2 (async), PostgreSQL, fastapi-users, Alembic,
  Jinja2 (templates de e-mail), Resend (envio de e-mail); gerenciamento de dependências com `uv`
  (`pyproject.toml` + `uv.lock`).
- Lint e formatação: `ruff` e `pre-commit` MUST passar antes de cada commit.
- Ambiente: a aplicação MUST subir via `docker compose`, configurada por `.env.development`;
  arquivos `.env` e credenciais MUST NOT ser versionados.
- Autenticação e autorização MUST usar fastapi-users; rotas que alteram dados MUST exigir
  usuário autenticado, salvo exceção documentada na spec.
- Uploads de arquivos (ex.: questionários) MUST validar tipo e conteúdo antes de processar.
- Idioma: nomes de domínio, mensagens ao usuário e documentação em português; identificadores
  técnicos de código seguem o estilo já presente no módulo.

## Fluxo de Desenvolvimento

- Toda funcionalidade nova passa pelo fluxo Spec Kit (specify → plan → tasks → implement).
- Commits seguem Conventional Commits em português (`feat:`, `fix:`, `infra:`, `docs:`, ...).
- Todo PR MUST descrever a mudança, listar os testes executados e verificar conformidade com
  esta constituição.
- Testes de carga (`locust_test`) SHOULD ser executados ao alterar rotas críticas de
  desempenho.

## Governança

Esta constituição prevalece sobre outras práticas do projeto. Emendas MUST ser feitas por PR
que atualize este arquivo, descreva a motivação e inclua plano de migração quando afetar código
existente. O versionamento segue SemVer: MAJOR para remoção ou redefinição incompatível de
princípios; MINOR para novo princípio/seção ou expansão material; PATCH para esclarecimentos e
correções de redação. Revisões de código e planos de feature MUST verificar conformidade;
desvios MUST ser justificados por escrito na seção de complexidade do plano. Orientações de uso
no dia a dia ficam no `README.md` e em `tests/README.md`.

**Version**: 1.0.0 | **Ratified**: 2026-09-30 | **Last Amended**: 2026-09-30
