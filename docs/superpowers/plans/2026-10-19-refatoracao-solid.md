# Refatoração SOLID do backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar `src/` (domain, infra, auth, repository, services, routers) para SOLID e idiomas Python sem mudar nenhum contrato de API.

**Architecture:** Camadas da constituição mantidas (routers → services → repository). `User` sobe para `domain`; auth ganha pacote próprio; repositórios ficam sem estado e sem sentinelas `False`; services recebem repositórios por construtor e o usuário por argumento; routers viram `APIRouter` de módulo, finos, com services via `Depends`; a lógica de arquivos sai do router para `ArquivosService` + `ArmazenamentoLocal`.

**Tech Stack:** Python 3.14, FastAPI 0.141, SQLAlchemy 2 async, fastapi-users, pytest + pytest-asyncio (SQLite em memória), Alembic.

**Spec:** `docs/superpowers/specs/2026-10-19-refatoracao-solid-design.md`

## Global Constraints

- Todos os comandos rodam de dentro de `src/`. Prova de cada tarefa: `python -m pytest tests -q -p no:cacheprovider` verde (hoje: 185 passed, +testes novos).
- Comportamento externo idêntico: mesmos paths, métodos, status e JSON. `GET /questionario` sem documento responde `200` com corpo `false` (o frontend depende disso: `QuestionarioService.meu()` em `frontend/src/app/core/services/questionario.ts`).
- Tabelas e colunas não mudam; sem migração Alembic nova. `migrations/env.py` só troca imports.
- Sem `Protocol`/ABC. Sem `print` (use `logger`). Nomes de domínio em português.
- Ponto de entrada continua `startapp.py` (`fastapi dev startapp.py`).
- Código da aplicação importa `src.x`; testes importam `x` (há `tests/src_redirect.py`). Mantenha cada estilo onde já existe.
- Commits em Conventional Commits, em português, terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Um commit por tarefa.
- `ruff` e `pre-commit` devem passar antes de cada commit.

## Review Focus

- `GET /questionario` sem documento devolve `200 false`, não `null` nem 404 (Task 4 pina).
- O conjunto de rotas públicas (`path` + método) é idêntico antes e depois (Task 0 congela, Task 4 confere).
- Anexo inválido no meio de um envio apaga os anexos já gravados naquele envio (Task 5 pina).
- Ativar conta de quem já tem questionário continua devolvendo `False` (redireciona a "não encontrado") (Task 3 pina).
- `buscar_para_atualizar` com `with_for_update()` não é exercitado pelo SQLite dos testes; conferir uma vez contra o PostgreSQL do `docker compose` (Task 2, passo final).

## File Structure

| Origem | Destino |
|---|---|
| `domain/models/base_models.py`, `mixin_model.py` | `domain/models/base.py`, `mixin.py` |
| `domain/models/questionarios/questionario.py` | `domain/models/questionario.py` |
| `User`, `gerar_codigo_ativacao`, listener em `infra/db.py` | `domain/models/usuario.py` |
| `domain/models/user_model.py` | `auth/usuario_manager.py` (`UserManager`, `get_user_manager`), `auth/backend.py` (`auth_backend`, `fastapi_users`, `current_active_user`) |
| `repository/user/user_rep.py` + `repository/usuarios/usuarios_rep.py` + `repository/arquivos/arquivos_rep.py` | `repository/usuarios.py`; busca de questionário vai para `repository/questionario.py`; novo `repository/base.py` |
| `services/verificacoes/usuario.py` | `services/usuarios/ativacao_service.py` |
| `shared/armazenamento.py` | `infra/armazenamento.py` |
| `routers/{users,usuarios,questionario,arquivos}/r_*.py` | `routers/{auth,usuarios,questionario,arquivos}.py`, `routers/dependencias.py`, `routers/__init__.py` |

---

### Task 0: Pré-requisitos e rede de segurança

**Files:**
- Create: `tests/unit/test_rotas_publicas.py`
- Commit: o trabalho de permissões já feito + docs

**Interfaces:**
- Produces: teste `test_rotas_publicas_nao_mudaram` com a lista congelada de `(path, método)`.

- [ ] **Step 1:** Commitar o trabalho de permissões como está no working tree: `git add shared/permissoes.py routers tests && git commit -m "feat: exigir_perfil com bypass de admin nas rotas"`; e a spec/plano em outro commit `docs: spec e plano da refatoração SOLID`.
- [ ] **Step 2:** Gerar a lista atual: dentro de `async with app.router.lifespan_context(app)` (de `startapp`), ler `app.openapi()["paths"]` e montar `{(path, método_em_maiúsculas)}`.
- [ ] **Step 3:** Escrever `test_rotas_publicas_nao_mudaram` em `tests/unit/test_rotas_publicas.py` comparando esse conjunto com um literal congelado no próprio arquivo, copiado da saída do passo 2.
- [ ] **Step 4:** Rodar `python -m pytest tests -q -p no:cacheprovider`; esperado: tudo verde (186+).
- [ ] **Step 5:** `git add tests/unit/test_rotas_publicas.py && git commit -m "test: congela as rotas públicas antes da refatoração"`

---

### Task 1: User em `domain`, pacote `auth`, `infra/db.py` enxuto

**Files:**
- Move (`git mv`): `domain/models/base_models.py`→`base.py`; `mixin_model.py`→`mixin.py`; `questionarios/questionario.py`→`domain/models/questionario.py`
- Create: `domain/models/usuario.py`, `auth/__init__.py`, `auth/usuario_manager.py`, `auth/backend.py`
- Delete: `domain/models/user_model.py`
- Modify: `infra/db.py`, `migrations/env.py`, `tests/validate_imports.py`, `tests/README.md`, `shared/permissoes.py`, `services/email/setup.py`, todos os imports nos routers/services/repository e nos testes
- Move test: `tests/unit/domain/test_user_manager.py` → `tests/unit/auth/test_usuario_manager.py`

**Interfaces:**
- Produces: `domain.models.usuario.User`, `gerar_codigo_ativacao() -> str`; `auth.backend.current_active_user`, `fastapi_users`, `auth_backend`; `auth.usuario_manager.UserManager`; `infra.db.get_async_session`, `get_user_db`, `engine`, `async_session_maker` (sem `User`).

- [ ] **Step 1: Escrever o teste de arquitetura primeiro.** Em `tests/unit/test_arquitetura.py`, adicionar `test_domain_nao_importa_de_infra_nem_de_camadas_superiores`: varre `domain/**/*.py` e falha se encontrar `import`/`from` de `infra`, `repository`, `services`, `routers` ou `auth` (com ou sem prefixo `src.`).
- [ ] **Step 2:** Rodar `pytest tests/unit/test_arquitetura.py -q`; esperado: FAIL citando `domain/models/user_model.py` e/ou `infra.db`.
- [ ] **Step 3: Mover e renomear com `git mv`**, depois reescrever imports por substituição de texto em todo `*.py`, `*.md`, `*.ini`: `domain.models.base_models`→`domain.models.base`; `domain.models.mixin_model`→`domain.models.mixin`; `domain.models.questionarios.questionario`→`domain.models.questionario`.
- [ ] **Step 4:** Criar `domain/models/usuario.py` com `User`, `gerar_codigo_ativacao` e o listener `before_insert` (corpo inalterado, copiado de `infra/db.py`). Em `infra/db.py` manter só `engine`, `async_session_maker`, `get_async_session`, `get_user_db`, importando `User` de `domain.models.usuario`.
- [ ] **Step 5:** Criar `auth/usuario_manager.py` (`UserManager`, `get_user_manager`) e `auth/backend.py` (`bearer_transport`, `get_jwt_strategy`, `auth_backend`, `fastapi_users`, `current_active_user`) a partir de `domain/models/user_model.py`, que é removido. Corpo inalterado.
- [ ] **Step 6:** Trocar todo `from …infra.db import User[, gerar_codigo_ativacao]` por `…domain.models.usuario`, e todo `…domain.models.user_model import current_active_user` por `…auth.backend`. Localizar com `grep -rn "infra.db\|user_model" --include='*.py' . | grep -v .venv`. Atualizar `migrations/env.py` e a lista `critical_modules` de `tests/validate_imports.py`.
- [ ] **Step 7:** Mover `test_user_manager.py` para `tests/unit/auth/` (com `__init__.py`), trocando `from domain.models import user_model` por `from auth import usuario_manager`.
- [ ] **Step 8:** `python -m pytest tests -q -p no:cacheprovider`; esperado: tudo verde, incluindo o teste do passo 1 e `test_rotas_publicas_nao_mudaram`. Rodar também `python tests/validate_imports.py`.
- [ ] **Step 9:** `git add -A && git commit -m "refactor: User em domain, pacote auth e infra/db enxuto"`

---

### Task 2: Repositories sem estado e sem sentinelas

**Files:**
- Create: `repository/base.py`, `repository/usuarios.py`, `repository/questionario.py`
- Delete: `repository/user/`, `repository/usuarios/`, `repository/arquivos/`, `repository/questionario/`
- Modify: `services/email/setup.py`, `shared/permissoes.py`, `services/*` (imports provisórios), `scripts/criar_admin.py` se importar repositório
- Test: `tests/unit/repository/test_usuarios_repository.py` (substitui `test_user_repository.py`), `test_questionario_repository.py` (reescrito)

**Interfaces:**
- Produces:
  - `Repositorio(db: AsyncSession)`; `async salvar() -> None` (commit; em `SQLAlchemyError` faz rollback e relança).
  - `UsuariosRepository(Repositorio)`: `buscar_por_email(email) -> User | None`; `buscar_por_id(user_id) -> User | None`; `buscar_codigo_ativacao(email) -> str | None`; `ativar_por_codigo(email, codigo) -> bool` (erro de commit é logado e devolve `False`, como hoje); `gerar_novo_codigo(usuario: User) -> None`; `painel_incubados(situacao=None) -> list[dict]` e `alterar_situacao(usuario, situacao, autor) -> User` (inalterados).
  - `QuestionarioRepository(Repositorio)`: `buscar(email) -> Questionario | None`; `buscar_para_atualizar(email) -> Questionario | None` (com `.with_for_update()`); `listar_todos() -> list[Questionario]`; `criar(questionario: Questionario) -> Questionario` (add + salvar).
  - Removidos: `atualizar_questionario`, `inicializar_questionario`, `gravar_questionario`, `buscar_plano`, `verificar_email`, `buscar_usuario`, `verificar_codigo_usuario`, `ArquivosRepository`.

- [ ] **Step 1: Testes.** Portar os casos de `test_user_repository.py` para `test_usuarios_repository.py` com a nova API, e reescrever os de `test_questionario_repository.py`. Asserções-chave: `buscar_por_email("nao@existe.com") is None`; `buscar_codigo_ativacao` devolve o código e `None` para e-mail inexistente; `ativar_por_codigo` com código errado devolve `False` e com certo ativa e zera `codigo_ativacao`; `buscar("x@y") is None` sem registro; `listar_todos()` devolve todos; `criar` persiste e devolve com `id`; `salvar()` faz rollback e relança quando o commit falha (monkeypatch em `db.commit` levantando `SQLAlchemyError`).
- [ ] **Step 2:** Rodar `pytest tests/unit/repository -q`; esperado: FAIL (módulos novos não existem).
- [ ] **Step 3:** Implementar `repository/base.py`, `usuarios.py`, `questionario.py` com as assinaturas acima; apagar os pacotes antigos. Reaproveitar as consultas existentes; não mudar o SQL do painel.
- [ ] **Step 4:** `services/email/setup.py::_verificar_codigo_usuario` passa a usar `UsuariosRepository(session).buscar_codigo_ativacao` e a checar `is None` (era `is False`); `enviar_email_cadastro` ajusta o teste correspondente em `tests/unit/services/test_email_setup.py`. Services e `shared/permissoes.py` apontam provisoriamente para os novos métodos (`buscar_por_email`, `buscar`) até a Task 3.
- [ ] **Step 5:** `python -m pytest tests -q -p no:cacheprovider`; esperado: verde.
- [ ] **Step 6:** Subir o PostgreSQL de teste do `docker compose` e executar `buscar_para_atualizar` uma vez via `psql`/script, confirmando que a consulta emitida termina em `FOR UPDATE`; registrar o resultado na mensagem do commit.
- [ ] **Step 7:** `git add -A && git commit -m "refactor: repositories sem estado, base com salvar() e sem sentinelas"`

---

### Task 3: Services com dependências injetadas

**Files:**
- Create: `services/usuarios/ativacao_service.py`
- Delete: `services/verificacoes/`
- Modify: `services/questionario/questionario_service.py`, `services/usuarios/usuarios_service.py`
- Test: `tests/unit/services/test_ativacao_service.py` (substitui `test_user_service.py`), `test_questionario_service.py`, `test_usuarios_service.py`

**Interfaces:**
- Consumes: repositórios da Task 2.
- Produces:
  - `QuestionarioService(repository: QuestionarioRepository)`: `buscar(user: User) -> Questionario | None`; `listar_todos() -> list[Questionario]`; `criar(user, entrada: QuestionarioInputSchema) -> Questionario` (`ConflitoError` com a mesma mensagem de hoje se já existe); `atualizar(user, entrada) -> Questionario` (`NaoEncontradoError("Questionário não encontrado.")`; mesma gravação de histórico e `atualizado_por/em`).
  - `UsuariosService(usuarios: UsuariosRepository, questionarios: QuestionarioRepository)`: `plano(email)`, `painel(situacao=None)`, `alterar_situacao(colaborador, email, situacao)`; mesmas exceções e mensagens.
  - `AtivacaoService(usuarios: UsuariosRepository, questionarios: QuestionarioRepository, email: EmailSetup)`: `async ativar(email: str, codigo: str) -> bool`; `async reenviar_codigo(email: str) -> bool`.

- [ ] **Step 1: Testes.** Reescrever os testes de service construindo-os com repositórios sobre `async_db`. Casos que decidem comportamento: `AtivacaoService.ativar` com código certo cria o questionário `iniciado` com `json_questionario == {}` e devolve `True`; **com questionário já existente devolve `False`**; código errado devolve `False` sem criar nada; `reenviar_codigo("nao@existe.com")` devolve `False`; `QuestionarioService.criar` duas vezes levanta `ConflitoError`; `buscar` sem documento devolve `None`; `UsuariosService.plano` sem questionário levanta `NaoEncontradoError("O incubado ainda não possui questionário.")`. `EmailSetup` entra como `AsyncMock`.
- [ ] **Step 2:** Rodar `pytest tests/unit/services -q`; esperado: FAIL.
- [ ] **Step 3:** Implementar os três services conforme as assinaturas. `QuestionarioService.criar` monta a entidade (`usuario_email`, `criado_por` = e-mail do usuário) e chama `repository.criar`; `AtivacaoService.ativar` inclui a inicialização do questionário (antes em `_auto_criar_questionario`).
- [ ] **Step 4:** `python -m pytest tests -q -p no:cacheprovider`; esperado: services verdes (os routers ainda usam construtores antigos: ajustar provisoriamente as chamadas nos routers para o build passar, sem mexer em comportamento).
- [ ] **Step 5:** `git add -A && git commit -m "refactor: services com repositórios injetados e AtivacaoService"`

---

### Task 4: Providers, routers de módulo e `startapp`

**Files:**
- Create: `routers/dependencias.py`, `routers/__init__.py`, `routers/auth.py`, `routers/usuarios.py`, `routers/questionario.py`, `routers/arquivos.py` (nesta tarefa, mantém a lógica atual dos handlers de arquivos, só migrada para `APIRouter` de módulo)
- Delete: `routers/users/`, `routers/usuarios/`, `routers/questionario/`, `routers/arquivos/`
- Modify: `startapp.py`, `tests/unit/routers/*`

**Interfaces:**
- Consumes: services da Task 3.
- Produces: `routers.dependencias.get_questionario_service`, `get_usuarios_service`, `get_ativacao_service` (cada um `(db: AsyncSession = Depends(get_async_session)) -> <Service>`); `routers.ROUTERS: list[APIRouter]`; cada módulo expõe `router`.

- [ ] **Step 1: Testes.** Adaptar os testes de rota: onde faziam `Router(app).iniciar()`, usar `from routers.<mod> import router` e `cliente_api([router], usuario)`. Reescrever `test_user_router.py` para sobrescrever `get_ativacao_service` via `dependency_overrides` em vez de `patch("routers.users.r_user…")`. Adicionar em `test_questionario_router.py`: `GET /questionario` sem documento devolve `200` e `response.json() is False`.
- [ ] **Step 2:** Rodar `pytest tests/unit/routers -q`; esperado: FAIL.
- [ ] **Step 3:** Implementar os routers como `APIRouter` de módulo (prefixos e tags atuais; `auth.py` inclui os routers do fastapi-users com os mesmos prefixos e mantém `/authenticated-route`, `/validar_email/{email}/{code}`, `/reenviar_codigo/{email}`). Em `questionario.py` remover os `try/except NegocioError` com `JSONResponse` (o handler global responde igual) e fazer `GET ""` devolver `questionario or False`. `routers/__init__.py` define `ROUTERS = [auth.router, usuarios.router, questionario.router, arquivos.router]`.
- [ ] **Step 4:** `startapp.py`: `for r in ROUTERS: app.include_router(r)` no nível do módulo; `lifespan` só loga início e fim.
- [ ] **Step 5:** `python -m pytest tests -q -p no:cacheprovider`; esperado: verde, incluindo `test_rotas_publicas_nao_mudaram`.
- [ ] **Step 6:** `git add -A && git commit -m "refactor: routers de módulo, providers e startapp enxuto"`

---

### Task 5: Arquivos fora do router

**Files:**
- Create: `infra/armazenamento.py`
- Delete: `shared/armazenamento.py`
- Modify: `services/arquivos/arquivos_service.py`, `routers/arquivos.py`, `routers/dependencias.py`
- Test: `tests/unit/infra/test_armazenamento.py`, `tests/unit/services/test_arquivos_service.py`, `tests/unit/routers/test_arquivos_router.py`

**Interfaces:**
- Produces:
  - `ArmazenamentoLocal(raiz: Path = Path("questionarios"))`: `pasta(email, aba) -> Path`; `caminho_relativo(email, aba, nome) -> str`; `listar(email, aba) -> list[str]`; `async gravar(email, aba, nome, partes: AsyncIterator[bytes]) -> int` (cria a pasta sob demanda, devolve bytes gravados); `apagar(email, aba, nomes: list[str]) -> None`; `arquivar(email, ordem) -> bool`; `sanitizar_email(email) -> str` (módulo, SHA-256 como hoje).
  - `ArquivosService(questionarios: QuestionarioRepository, armazenamento: ArmazenamentoLocal)`: `verificar_edicao(email) -> Questionario` (regra atual); `async receber(email, aba, arquivos: list[UploadFile]) -> list[dict]` (mesmo dicionário `{nome, content_type, tamanho, caminho}`); `listar(email, aba) -> list[str]`; `caminho_download(email, aba, nome) -> Path`; `async apagar(email, aba, nomes) -> dict` (`{"arquivos_deletados", "erros"}` como hoje).
  - `routers.dependencias.get_armazenamento() -> ArmazenamentoLocal` e `get_arquivos_service`.

- [ ] **Step 1: Testes.** Substituir o `monkeypatch` de `armazenamento.UPLOAD_DIR` por `app.dependency_overrides[get_armazenamento] = lambda: ArmazenamentoLocal(tmp_path)`. Em `test_arquivos_service.py` cobrir: PDF válido gravado e retornado com `tamanho` e `caminho`; arquivo vazio recusado com `ArquivoInvalidoError`; **segundo arquivo inválido apaga o primeiro já gravado no mesmo envio**; extensão fora da lista recusada; `apagar` com nome inexistente vai para `erros`. Em `test_armazenamento.py`: `pasta` usa o SHA-256 do e-mail em minúsculas; `listar` de pasta inexistente devolve `[]`. Os testes de rota existentes (374 linhas) continuam como contrato HTTP.
- [ ] **Step 2:** Rodar `pytest tests/unit -q -k "arquivos or armazenamento"`; esperado: FAIL.
- [ ] **Step 3:** Implementar `ArmazenamentoLocal` movendo as funções de `shared/armazenamento.py` (e `aiofiles` para `gravar`); remover `UPLOAD_DIR.mkdir(...)` do import do módulo. Implementar `ArquivosService.receber` com o laço de hoje (nome seguro, extensão, assinatura no primeiro bloco, tamanho máximo de `settings.upload_tamanho_maximo_mb`, vazio, limpeza em falha) alimentando `armazenamento.gravar` com um gerador assíncrono que valida cada bloco.
- [ ] **Step 4:** `routers/arquivos.py` fica fino: injeta `ArquivosService`, chama o service e converte `ArquivoInvalidoError`→422, `ArquivoNaoEncontradoError`→404 e os `OSError`→as exceções `ErroAoSalvarArquivoError` / `ErroAoListarArquivosError` / `ErroAoFazerDownloadError` atuais. Manter `exigir_perfil(...)` de cada rota exatamente como está hoje (o upload usa `("incubado", "consultor")`).
- [ ] **Step 5:** `python -m pytest tests -q -p no:cacheprovider`; esperado: verde.
- [ ] **Step 6:** `git add -A && git commit -m "refactor: lógica de arquivos em ArquivosService e ArmazenamentoLocal"`

---

### Task 6: Regras de arquitetura e documentação

**Files:**
- Modify: `tests/unit/test_arquitetura.py`, `README.md`, `tests/README.md`, `TESTS_SUMMARY.md`

**Interfaces:**
- Produces: testes de arquitetura permanentes.

- [ ] **Step 1: Testes.** Em `tests/unit/test_arquitetura.py` adicionar: (a) `repository` não importa de `services` nem `routers`; (b) `services` não importa de `routers`; (c) nenhum módulo em `routers/` chama construtores de `*Service(` ou `*Repository(` (usa `Depends`); (d) o teste de `domain` da Task 1. Ajustar `_arquivos_novos` e o conjunto `ANTIGOS`, que deixam de existir (todos os routers passam a ser verificados contra acesso direto ao banco).
- [ ] **Step 2:** Rodar `pytest tests/unit/test_arquitetura.py -q`; esperado: PASS (se falhar, há violação real: corrigir o código, não o teste).
- [ ] **Step 3:** Atualizar `README.md`, `tests/README.md` e `TESTS_SUMMARY.md` com a estrutura final e os caminhos novos.
- [ ] **Step 4:** Verificação final: `python -m pytest tests -q -p no:cacheprovider`, `python tests/validate_imports.py`, `ruff check .`, e subir `docker compose up` conferindo `GET /docs` com as mesmas rotas.
- [ ] **Step 5:** `git add -A && git commit -m "docs: estrutura final e regras de arquitetura"`
