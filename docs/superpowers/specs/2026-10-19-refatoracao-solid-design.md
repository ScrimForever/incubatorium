# Refatoração SOLID e pythônica do backend

Data: 2026-10-19 · Escopo: `src/` (routers, services, repository, domain, infra, shared)

## Objetivo

Reorganizar o backend para seguir SOLID e idiomas Python **sem mudar comportamento**: rotas,
payloads, códigos de status, regras de negócio e esquema do banco ficam idênticos.

Contrato de comportamento: os 185 testes atuais (somente imports e construtores são
atualizados) e a constituição (`.specify/memory/constitution.md`): camadas
routers → services → repository, `async`, router sem acesso direto ao banco, YAGNI.

Decisões já tomadas com o dono do projeto:

- Pode reorganizar pastas e caminhos de import.
- Admin é bypass nas permissões (já implementado em `shared/permissoes.py`).
- Sem `Protocol`/ABC para repositório ou armazenamento: há uma única implementação cada
  (YAGNI). DIP é obtida por injeção via construtor e `Depends`.

## Problemas que motivam a mudança

| Princípio | Problema |
|---|---|
| S | `routers/arquivos/r_arquivos.py` (230 linhas) mistura HTTP, streaming de upload, validação, I/O de disco e regra de exclusão. |
| S | `infra/db.py` mistura model `User`, gerador de código, listener, engine e sessão. `domain/models/user_model.py` é configuração de auth, não model. |
| D | Services instanciam repositórios concretos; só `QuestionarioService` e `ArquivosService` aceitam injeção. Routers montam services à mão. |
| D | `domain` importa de `infra` (`User` mora em `infra/db.py`). |
| I | Services recebem `AsyncSession` inteira só para repassá-la. `ArquivosService` guarda `self.db` sem usar. |
| O | Três estilos de router (classe com `iniciar()`, `@dataclass`, `APIRouter` de módulo); cada router novo exige editar `startapp.py`. |
| Pythônico | `X \| Literal[False]` como retorno; `inicializar_questionario(email)` ignora o argumento; `buscar_para_atualizar` documenta `FOR UPDATE` mas não usa; `atualizar_questionario` sem uso. |
| Duplicação | `select(User).where(email==...)` ×4 em `UserRepository`; `buscar_por_email` repete `buscar_usuario`; `ArquivosRepository.buscar` repete a busca do questionário; `try/commit/except/rollback` ×3. |
| Nomes | `user`/`usuarios`/`verificacoes` e `users`/`usuarios` coexistem. |

## Estrutura-alvo

```
domain/models/   usuario.py (User, movido de infra/db.py), questionario.py, enums.py, base.py, mixin.py
domain/schemas/  (sem mudança)
infra/           config.py, db.py (somente engine e sessão), armazenamento.py (disco)
auth/            fastapi-users: UserManager, backend JWT, current_active_user
repository/      base.py, usuarios.py, questionario.py
services/        usuarios/{ativacao_service,usuarios_service}.py, questionario/, arquivos/, email/
routers/         auth.py, usuarios.py, questionario.py, arquivos.py, dependencias.py
shared/          permissoes.py, exceptions/, handlers.py, validacao_arquivos.py
```

Regras de dependência (verificadas por teste de arquitetura):

- `domain` não importa de `infra`, `repository`, `services` nem `routers`.
- `repository` importa de `domain` e `infra.db` (sessão), nunca de `services`/`routers`.
- `services` importam de `domain`, `repository`, `infra.armazenamento`, `shared`.
- `routers` importam de `services`, `domain.schemas`, `shared`, `auth`; não instanciam services
  nem repositórios (usam `Depends`).

`UserRepository` e `UsuariosRepository` viram `repository/usuarios.py`. `ArquivosRepository`
é removido (usa a busca de `QuestionarioRepository`). O model `User` mantém tabela e colunas
(sem migração); `migrations/env.py` passa a importar de `domain.models`.

## Componentes

### Repositories (sem estado, sem sentinelas)

- `Repositorio` (base): guarda `db`; `salvar()` faz `commit` e, em `SQLAlchemyError`,
  `rollback` e relança. Substitui os três blocos repetidos.
- Métodos recebem o e-mail por argumento (hoje `QuestionarioRepository` guarda `self.user`).
- Retornam o objeto ou `None`; falhas inesperadas propagam. Nada de `Literal[False]`.
- Removidos: `atualizar_questionario` (sem uso) e o parâmetro ignorado de
  `inicializar_questionario`.
- `buscar_para_atualizar` passa a usar `with_for_update()`, como o docstring já afirma. Se o
  SQLite dos testes não suportar, a cláusula é aplicada só em PostgreSQL e o fato é registrado
  na spec do plano.

### Services (dependências injetadas)

- Recebem repositórios (e `ArmazenamentoLocal`, `EmailSetup`) no construtor; não recebem
  `AsyncSession`.
- O usuário da requisição entra como argumento do método, não como estado do service.
- `UserService` → `AtivacaoService` (código de ativação e reenvio de e-mail).
  `UsuariosService` fica com painel, plano e situação.
- Services traduzem `None` em `NaoEncontradoError`/`ConflitoError`; o handler global já
  converte `NegocioError` em JSON `{"mensagem": ...}`.

### Routers (finos)

- Todos `APIRouter` de módulo. `routers/__init__.py` expõe `ROUTERS`; `startapp.py` os inclui
  em laço. O `lifespan` deixa de registrar rotas.
- `routers/dependencias.py` define os providers (`get_questionario_service`,
  `get_usuarios_service`, `get_ativacao_service`, `get_arquivos_service`).
- Removidos os `try/except NegocioError` com `JSONResponse` manual de `r_questionario.py`
  (o handler global produz resposta idêntica).
- Permissões continuam via `exigir_perfil(...)`.

### Arquivos

- `infra/armazenamento.py::ArmazenamentoLocal`: caminhos, gravação em streaming, listagem,
  remoção e arquivamento (absorve `shared/armazenamento.py`). Cria o diretório de uploads sob
  demanda, não no import do módulo.
- `ArquivosService`: verificar edição, gravar anexos (nome seguro, extensão, assinatura,
  tamanho, arquivo vazio, limpeza em falha), listar, baixar (resolve caminho), apagar.
  Usa `shared/validacao_arquivos.py` como está.
- Router: recebe `UploadFile`/corpo, chama o service, devolve a resposta. Mapeia os mesmos
  erros para os mesmos status (422 para `ArquivoInvalidoError`, 404, 500).

### Auth

- `auth/` reúne `UserManager`, `JWTStrategy`, `auth_backend`, `fastapi_users` e
  `current_active_user`. Os hooks de e-mail usam `EmailSetup` como hoje.
- `routers/auth.py` monta os routers do fastapi-users e as rotas `/validar_email`,
  `/reenviar_codigo`, `/authenticated-route`, com os mesmos paths.

## Testes

- Os testes existentes definem o comportamento esperado; mudam só imports e a construção de
  repositórios/services.
- Novos: testes de `ArquivosService` e `ArmazenamentoLocal` para a lógica extraída do router;
  teste de arquitetura para as regras de dependência acima e para "router não instancia
  service".
- Critério de aceite por passo: `python -m pytest tests -q` verde.

## Ordem de execução (um commit por passo, testes verdes em cada um)

0. Commitar o trabalho de permissões já feito (isola o diff da refatoração).
1. `User` → `domain/models/usuario.py`; `auth/`; `infra/db.py` enxuto; ajustar
   `migrations/env.py` e imports.
2. Repositories: unificar, sem estado, sem sentinelas, base `salvar()`.
3. Services: injeção por construtor, usuário por argumento, separar ativação.
4. `routers/dependencias.py`, routers como módulos, `ROUTERS` e `startapp.py`.
5. Arquivos: `ArmazenamentoLocal` + `ArquivosService`; router fino.
6. Teste de arquitetura e atualização do `README.md`.

## Fora de escopo

- Mudar contratos de API, schemas Pydantic, tabelas ou migrações.
- Reorganização por feature (contradiz o Princípio I da constituição).
- Novas abstrações (`Protocol`/ABC) sem segunda implementação.
- `/users/*` do fastapi-users e permissões dessas rotas.

## Riscos

- O passo 1 altera imports usados por quase todos os testes; é onde a regressão aparece primeiro.
- `with_for_update()` pode se comportar diferente no SQLite de teste e no PostgreSQL.
- `Dockerfile` e `docker-compose.yml` iniciam por `startapp.py` na raiz de `src/`; o ponto de
  entrada é preservado. `migrations/env.py` precisa dos novos caminhos.
