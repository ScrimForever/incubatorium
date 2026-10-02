---
description: "Tarefas da feature Gestão de Incubação"
---

# Tasks: Gestão de Incubação

**Input**: Design documents from `/specs/001-gestao-incubacao/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md

**Tests**: incluídos — o Princípio III da constituição (testes, NON-NEGOTIABLE) os exige para toda regra de negócio e rota nova. Em cada história, escreva os testes primeiro e confirme que falham.

**Organization**: tarefas agrupadas por história de usuário. Caminhos relativos ao diretório `src/` do repositório (imports do código usam o prefixo `src.`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história a que a tarefa pertence (US1–US4)

## Phase 1: Setup (Alembic e base de testes)

**Purpose**: introduzir Alembic (Princípio IV da constituição) e preparar a base de testes.

- [X] T001 Inicializar Alembic assíncrono em `src/migrations/` (`env.py` usando `settings.pg_force_alembic` e `Base.metadata` de `src/domain/models/base_models.py`, importando todos os models) e criar `src/alembic.ini`
- [X] T002 Gerar a migração baseline do esquema atual (tabelas `user` e `questionario`) em `src/migrations/versions/` e validar `uv run alembic upgrade head` em banco vazio
- [X] T003 Remover `create_db_and_tables()` do `lifespan` em `src/startapp.py` e de `src/infra/db.py`; fazer o serviço `web` de `docker-compose.yml` rodar `alembic upgrade head` antes do `uvicorn`; atualizar "Como subir o projeto" no `README.md`
- [X] T004 [P] Em `tests/conftest.py`, criar fábricas de usuário por perfil (`is_admin`, `is_colaborador`, `is_consultor`, `is_incubado`; exatamente um verdadeiro) e garantir que as tabelas novas sejam criadas no SQLite em memória (mantendo o mapeamento `JSONB`→`JSON`)

## Phase 2: Foundational (bloqueia todas as histórias)

**Purpose**: permissões por perfil, exceções de negócio e etapas em código.

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

- [X] T005 Criar `src/shared/permissoes.py` com as dependências FastAPI `exigir_colaborador`, `exigir_consultor` (só `is_consultor`) e `exigir_acesso_incubado(email)` (permite o próprio incubado, qualquer colaborador, ou qualquer consultor; caso contrário HTTP 403), todas sobre `current_active_user` de `src/domain/models/user_model.py`
- [X] T006 [P] Criar `src/shared/exceptions/negocio_exceptions.py` com `PedidoJaDecididoError`, `MotivoObrigatorioError`, `SemPermissaoError`, `EtapaInvalidaError`, `EtapaSemRespostaError`, `ConflitoError`; exportar em `src/shared/exceptions/__init__.py`; registrar handlers em `src/startapp.py` que devolvem JSON `{"mensagem": ...}` com 403/404/409/422 conforme `contracts/api.md`
- [X] T007 [P] Criar `src/domain/models/questionarios/etapas.py` com a lista ordenada de etapas (`id` estável, `titulo`, `ativa`) alinhada às abas de `src/routers/arquivos/r_arquivos.py`, e as funções `listar_etapas()` e `etapa_existe(etapa_id)`
- [X] T008 [P] Criar script `src/scripts/criar_admin.py` (executável por `python -m src.scripts.criar_admin --perfil admin|colaborador|consultor --email X --password Y`; para o admin inicial lê também `ADMIN_EMAIL`/`ADMIN_PASSWORD` de `src/infra/config.py`), sendo idempotente: cria o usuário se não existir ou ajusta os perfis se existir, deixando exatamente um perfil verdadeiro e `is_incubado=false`. Como o listener `before_insert` de `User` em `src/infra/db.py` força `is_active=false`, o script ativa a conta com um UPDATE após o insert (não há fluxo de e-mail). É a forma provisória de criar equipe, já que a administração de contas por endpoints de admin foi adiada; documentar no `README.md`; teste em `tests/unit/scripts/test_criar_admin.py` (conta ativa, um único perfil verdadeiro, idempotência)
- [X] T009 [P] Testes unitários de permissões em `tests/unit/shared/test_permissoes.py` (matriz perfil × dependência) e de etapas em `tests/unit/domain/test_etapas.py`

## Phase 3: User Story 1 - Candidato se cadastra e é aprovado (Priority: P1) 🎯 MVP

**Goal**: candidato envia o questionário; colaborador aprova ou rejeita (com motivo); o questionário rejeitado é arquivado no histórico e o candidato recomeça com um novo.

**Independent Test**: cadastrar candidato, enviar, rejeitar com motivo, reiniciar (o 1º vira `<email>_1`), reenviar, aprovar, e ver o usuário com situação `ativo` em `GET /usuarios?perfil=incubado` (roteiro 2 do `quickstart.md`).


### Tests for User Story 1 (escrever primeiro e ver falhar — Princípio III)

- [X] T010 [P] [US1] Testes do repositório de ingresso em `tests/unit/repository/test_ingresso_repository.py` (arquivar: o rejeitado passa a `<email>_1`, o novo vigente usa `<email>` com status `pendente` e respostas copiadas; 2ª rejeição gera `<email>_2`; `n` = linhas já arquivadas + 1; rollback completo se qualquer passo falhar; listagem do histórico só casa `^<email>_[0-9]+$` e não confunde e-mails parecidos; nunca mais de uma linha vigente por usuário)
- [X] T011 [P] [US1] Testes do serviço de ingresso em `tests/unit/services/test_ingresso_service.py` (aprovar grava `aprovado` e `situacao_incubacao=ativo` no usuário; rejeitar sem motivo → `MotivoObrigatorioError`; decidir pedido já decidido → `PedidoJaDecididoError`; reiniciar só é permitido com questionário `rejeitado`, senão `ConflitoError`; e-mail enviado em cada decisão com e-mail mockado)
- [X] T012 [P] [US1] Testes dos routers em `tests/unit/routers/test_ingresso_router.py` (permissões: só COL aprova/rejeita; INC só vê o próprio histórico; só INC com questionário rejeitado chama `/ingresso/reiniciar`; 401 sem login)

### Implementation for User Story 1

- [X] T013 [US1] Adicionar ao model `Questionario` em `src/domain/models/questionarios/questionario.py` as colunas `decidido_por` (String(255), nullable), `decidido_em` (DateTime(timezone=True), nullable) e `motivo_decisao` (Text, nullable); manter `usuario_email` (String(255)) como PK, igual ao e-mail do usuário vigente. Linhas arquivadas usam `<email>_<n>` na mesma coluna, por isso **não** declarar FK para `user.email`
- [X] T014 [P] [US1] Adicionar ao model `User` em `src/infra/db.py` as colunas `situacao_incubacao` (Enum `ativo|concluido|desistente`, nullable), `situacao_alterada_em` (DateTime(timezone=True), nullable) e `situacao_alterada_por` (String(255), nullable). Não criar entidade "incubado": o incubado é o próprio `User` (fastapi-users) com `is_incubado=true` e questionário `aprovado`
- [X] T015 [US1] Gerar a migração Alembic das colunas novas de `questionario` (`decidido_por`, `decidido_em`, `motivo_decisao`) e de `user` (`situacao_incubacao`, `situacao_alterada_em`, `situacao_alterada_por`) em `src/migrations/versions/`
- [X] T016 [P] [US1] Criar schemas Pydantic em `src/domain/schemas/ingresso_schema.py` (`PedidoOutput`, `HistoricoQuestionarioOutput` com a chave arquivada, motivo e decisor, `RejeitarInput` com `motivo` não vazio, `UsuarioIncubadoOutput` baseado em `User`)
- [X] T017 [US1] Criar `src/repository/ingresso/ingresso_rep.py` (async): listar pedidos por status, gravar decisão (na aprovação, definir `situacao_incubacao=ativo` no `User`), listar o histórico de um e-mail (chaves `^<email>_[0-9]+$`) e `arquivar_e_criar_novo(email)`: numa única transação, calcular `n` (arquivados + 1), renomear `usuario_email` do rejeitado para `<email>_<n>` e inserir a nova linha vigente (`pendente`, `json_questionario` copiado, `criado_por` = e-mail)
- [X] T018 [US1] Criar `src/services/ingresso/ingresso_service.py`: `enviar(user)` (permitido de `pendente|iniciado` → `aguardando_aprovacao`, atualizando a única linha vigente), `reiniciar(user)` (só com questionário `rejeitado`; chama `arquivar_e_criar_novo` e, após o commit, renomeia a pasta de uploads do questionário arquivado para o mesmo sufixo e recria a pasta vigente como cópia, via helper em `src/routers/arquivos/r_arquivos.py` ou `src/services/ingresso/arquivos.py`), `aprovar`, `rejeitar(motivo)` (motivo obrigatório; decisão só sobre `aguardando_aprovacao`), com logs `loguru` e e-mail ao candidato via `src/services/email/setup.py`
- [X] T019 [P] [US1] Criar templates de e-mail de decisão (aprovado/rejeitado com motivo) em `src/templates/html/` e métodos correspondentes em `src/services/email/setup.py`
- [X] T020 [US1] Criar `src/routers/ingresso/r_ingresso.py` com `POST /ingresso/enviar`, `POST /ingresso/reiniciar`, `GET /ingresso`, `GET /ingresso/{email}/historico`, `POST /ingresso/{email}/aprovar`, `POST /ingresso/{email}/rejeitar` conforme `contracts/api.md`, e registrá-lo no `lifespan` de `src/startapp.py`
- [X] T021 [US1] Criar `GET /etapas` (todos os perfis autenticados) em `src/routers/ingresso/r_ingresso.py` usando `src/domain/models/questionarios/etapas.py`
- [X] T022 [US1] Ajustar `PUT /questionario` em `src/routers/questionario/r_questionario.py`: bloquear edição em `aguardando_aprovacao` e `rejeitado`; em incubado `aprovado`, atualizar o plano vigente preenchendo `atualizado_em/atualizado_por`, sem alterar o status

## Phase 4: User Story 2 - Incubado mantém o plano de negócio (Priority: P2)

**Goal**: incubado aprovado revisa o questionário (plano de negócio) sem alterar as notas dos consultores e anexa documentos validados.

**Independent Test**: como incubado aprovado, salvar novas respostas (status continua aprovado, notas intactas) e enviar um anexo válido e um com conteúdo falso (roteiro 3 do `quickstart.md`).


### Implementation for User Story 2

- [X] T023 [US2] Criar `src/routers/usuarios/r_usuarios.py` (prefixo `/usuarios`, registrado em `src/startapp.py`) com `GET /usuarios/{email}/plano`, que devolve o questionário vigente e usa `exigir_acesso_incubado`; teste em `tests/unit/routers/test_usuarios_router.py`
- [X] T024 [US2] Validar tipo e tamanho dos anexos em `POST /arquivos/questionario/{aba}` de `src/routers/arquivos/r_arquivos.py` (extensões permitidas e tamanho máximo em `src/infra/config.py`; inválido → 422) e permitir leitura a COL e CON; teste em `tests/unit/routers/test_arquivos_router.py`

## Phase 5: User Story 3 - Consultor avalia o incubado (Priority: P3)

**Goal**: consultor avalia cada etapa do questionário (nota 1–5 + parecer). A nota é gravada em `json_questionario[etapa].nota` (sem recomendações nem histórico).

**Independent Test**: avaliar a etapa 2 com nota 4 e parecer, incubado vê; incubado tentando avaliar recebe 403 (roteiro 4 do `quickstart.md`).


### Tests for User Story 3

- [X] T025 [P] [US3] Testes dos repositórios em `tests/unit/repository/test_avaliacao_repository.py` (gravar nota em `json_questionario[etapa].nota` com `valor`, `texto`, `avaliador` e `avaliado_em`; preserva as demais abas e campos da aba; avaliar de novo substitui a nota anterior)
- [X] T026 [P] [US3] Testes do serviço em `tests/unit/services/test_avaliacoes_service.py` (nota fora de 1–5 → erro; `parecer` vazio → erro; etapa inexistente → `EtapaInvalidaError`; etapa sem resposta → `EtapaSemRespostaError`; perfil que não é consultor → `SemPermissaoError`; pedido só em `aguardando_aprovacao|aprovado`; incubado `concluido|desistente` → `ConflitoError`; e-mail ao incubado enviado, e falha no e-mail não desfaz a nota) e em `tests/unit/services/test_ingresso_service.py` (o `PUT` do incubado não altera nem apaga notas; `reiniciar` zera as notas do novo questionário e mantém as do arquivado)
- [X] T027 [P] [US3] Testes do router em `tests/unit/routers/test_avaliacoes_router.py` (CON avalia; INC próprio lê as avaliações; outro INC → 403; COL lê; incubado não grava avaliação → 403)

### Implementation for User Story 3

- [X] T029 [US3] Proteger as notas dos consultores contra o incubado: em `src/services/ingresso/ingresso_service.py` (`atualizar_plano`) mesclar o JSON recebido com as `nota` já gravadas (descartar `nota` vinda do corpo; abas novas recebem nota vazia `{valor: null, texto: "", avaliador: null}`) e, em `src/repository/ingresso/ingresso_rep.py` (`arquivar_e_criar_novo`), zerar as notas do JSON copiado para o novo questionário
- [X] T031 [P] [US3] Criar schemas em `src/domain/schemas/avaliacao_schema.py` (`AvaliacaoInput` com `nota` inteira de 1 a 5 e `parecer` não vazio; `AvaliacaoOutput` com `etapa_id`, `titulo`, `nota`, `parecer`, `avaliador`, `avaliado_em`)
- [X] T032 [US3] Criar `src/repository/avaliacao/avaliacao_rep.py` (async): `gravar_nota` faz leitura-modificação-escrita do questionário com `SELECT ... FOR UPDATE`, reatribuindo um novo dict ao JSONB para o SQLAlchemy detectar a mudança; `listar_notas` lê as notas por etapa
- [X] T034 [US3] Criar `src/services/avaliacoes/avaliacoes_service.py`: valida perfil consultor, pedido em `aguardando_aprovacao|aprovado`, incubado não `concluido|desistente`, etapa existente e respondida no JSON, nota 1–5 e parecer não vazio; grava `nota = {valor, texto, avaliador, avaliado_em}` e notifica o incubado por e-mail
- [X] T035 [P] [US3] Criar template de e-mail "nova avaliação" em `src/templates/html/` e método em `src/services/email/setup.py`
- [X] T036 [US3] Criar `src/routers/avaliacoes/r_avaliacoes.py` com `PUT /usuarios/{email}/avaliacoes/{etapa_id}` (só consultor) e `GET /usuarios/{email}/avaliacoes` (próprio incubado, colaborador ou consultor) e registrá-lo em `src/startapp.py`

## Phase 6: User Story 4 - Colaborador administra a incubadora (Priority: P4)

**Goal**: colaborador acompanha todos os incubados e altera a situação. A administração de contas de equipe por endpoints de admin está adiada (ver spec); a equipe é criada pelo script de T008.

**Independent Test**: como colaborador, consultar o painel; incubado recebe 403 nas rotas de colaborador (roteiro 1 e 5 do `quickstart.md`).


### Tests for User Story 4

- [X] T037 [P] [US4] Testes dos routers em `tests/unit/routers/test_usuarios_router.py` (só COL em painel e situação; incubado e consultor recebem 403)

### Implementation for User Story 4

- [X] T038 [P] [US4] Criar schema em `src/domain/schemas/incubado_schema.py` (`IncubadoResumo`: situação, estado do plano, data da última avaliação)
- [X] T040 [US4] Criar `GET /usuarios?perfil=incubado&situacao=` (painel consolidado dos usuários com `is_incubado`, com situação, estado do plano e data da última avaliação, em consulta agregada única, sem N+1; alvo < 3 s com 500 incubados) e `PATCH /usuarios/{email}/situacao` em `src/routers/usuarios/r_usuarios.py`; mudança de situação grava `situacao_alterada_por/em` no `User` e preserva todo o histórico; a data da última avaliação vem da coluna `questionario.ultima_avaliacao_em` (migração `0003` em `src/migrations/versions/`)
- [X] T041 [US4] Garantir que usuários incubados `concluido|desistente` deixem de receber avaliações (checagem de situação no serviço de avaliações) com testes em `tests/unit/services/test_usuarios_service.py`

## Phase 7: Polish & Cross-Cutting

- [X] T042 Rodar `./run-tests.sh` e `uv run ruff check . && uv run ruff format --check .`; corrigir pendências; garantir `tests/validate_imports.py` verde e arquivos em UTF-8
- [X] T043 Executar o roteiro completo do `quickstart.md` contra `docker compose up` e registrar divergências
- [X] T044 [P] Adicionar cenários de carga das rotas `GET /usuarios?perfil=incubado`, `GET /ingresso` e `GET /questionario` em `src/locust_test/` (constituição: testes de carga ao alterar rotas críticas)
- [X] T045 [P] Atualizar `README.md` e `tests/README.md` com as novas rotas, perfis e o comando de migração
- [X] T046 Revisão de segurança dos novos endpoints: nenhuma rota de escrita sem autenticação, e teste que um incubado não acessa dados de outro (SC-004) em `tests/unit/routers/test_isolamento_dados.py`

## Phase 8: Convergence

- [X] T047 CRITICAL: mover o acesso a dados de `GET /usuarios/{email}/plano` para fora do router — criar `buscar_plano(email)` em `src/repository/usuarios/usuarios_rep.py` e um método no `UsuariosService` (`src/services/usuarios/usuarios_service.py`), e fazer `src/routers/usuarios/r_usuarios.py` só chamar o serviço (sem `db.get`); manter `tests/unit/routers/test_usuarios_router.py` verde per Constitution I (contradicts)
- [X] T048 (substituída pela Phase 9: anexos passam a ser referências, sem base64) CRITICAL: validar os anexos embutidos em `json_questionario` (abas com `arquivos[]`: `nome`, `tipo`, `tamanho`, `conteudo_base64`) ao gravar o questionário — em `src/services/ingresso/ingresso_service.py` (`atualizar_plano`) e em `QuestionarioRepository.gravar_questionario` (`src/repository/questionario/questionario_rep.py`), decodificar o base64, aplicar `nome_seguro`, `validar_extensao`, `validar_conteudo` e `validar_tamanho` de `src/shared/validacao_arquivos.py` com o limite de `upload_tamanho_maximo_mb`, recusar com 422 e testar em `tests/unit/services/test_ingresso_service.py` e `tests/unit/routers/test_questionario_router.py` per Constitution (uploads) e FR-015 (partial)
- [X] T049 FR-004/FR-016: fazer `EmailSetup.enviar_notificacao` em `src/services/email/setup.py` enviar em qualquer ambiente quando houver chave de API, deixando de depender de `settings.enviroment == "development"`; criar `EMAIL_ENVIO_HABILITADO` em `src/infra/config.py` (padrão verdadeiro; falso em testes) e cobrir em `tests/unit/services/test_email_setup.py` (envia quando habilitado, não envia quando desligado, erro do Resend devolve `False`) per FR-016 (partial)
- [X] T050 FR-011: bloquear a linha do questionário no `PUT` do incubado — adicionar `buscar_para_atualizar(email)` com `SELECT ... FOR UPDATE` em `src/repository/ingresso/ingresso_rep.py`, usá-lo em `IngressoService.atualizar_plano` (`src/services/ingresso/ingresso_service.py`) e testar a chamada em `tests/unit/services/test_ingresso_service.py` per research §7 (partial)
- [X] T051 Constitution I: mover as consultas de `shared/permissoes.py` (a busca do usuário em `exigir_acesso_incubado`) para `UsuariosRepository`, mantendo as dependências FastAPI finas e os testes de `tests/unit/shared/test_permissoes.py` verdes per Constitution I (partial)
- [X] T052 Constitution V: trocar o `print` de `on_after_request_verify` em `src/domain/models/user_model.py` por `logger.info` (sem expor o token no log) per Constitution V (contradicts)
- [X] T053 Constitution (rotas sem login): documentar em `specs/001-gestao-incubacao/spec.md` as exceções de autenticação — `/auth/register`, `/auth/jwt/login`, reset/verificação de senha, `/validar_email/{email}/{code}` e `/reenviar_codigo/{email}` — com a justificativa de cada uma per Constitution (Restrições Técnicas) (partial)
- [X] T054 Revisar `EMAIL_DESTINO_OVERRIDE` (`src/infra/config.py`, `src/services/email/setup.py`) e o nível de log de `get_async_session` (`src/infra/db.py`): registrar ambos em `specs/001-gestao-incubacao/research.md` e `plan.md`, ou removê-los se não forem desejados per spec/plan (unrequested)

## Phase 9: Ajuste - anexos enviados pelo endpoint de arquivos e referenciados no JSON (US2)

**Goal**: os uploads acontecem só em `/arquivos/questionario/{aba}` (multipart form); o `json_questionario` guarda o `caminho` de cada arquivo em `arquivos[]` da etapa, mantido pelo servidor, para facilitar inclusão e remoção. Substitui a validação de base64 da T048.

**Independent Test**: como incubado com questionário `pendente`, enviar um PDF para a etapa 6 e ver `arquivos[0].caminho` em `GET /questionario`; salvar as respostas com `PUT` (referência intacta); apagar o arquivo e ver a referência sumir; tentar `PUT` com `conteudo_base64` (422).

- [X] T055 [P] [US2] Criar `src/domain/models/questionarios/arquivos.py` com funções puras sobre o JSON: `nova_referencia(email, aba, nome, tipo, tamanho)` → `{nome, tipo, tamanho, caminho}` (`caminho` relativo à pasta de uploads: `<e-mail sem @ e .>/<aba>/<nome>`, via `src/shared/armazenamento.py`), `adicionar_referencias(json, aba, refs)` (reenviar o mesmo `caminho` substitui, sem duplicar), `remover_referencias(json, aba, nomes)`, `preservar_arquivos(novo, atual)` (descarta o `arquivos` vindo do cliente e mantém o gravado; abas sem lista ganham `[]`), `reescrever_caminhos(json, pasta_de, pasta_para)` e `tem_conteudo_embutido(json)` (algum anexo com `conteudo_base64`); testes em `tests/unit/domain/test_arquivos_json.py`
- [X] T056 [US2] Trocar `validar_anexos_questionario` (base64) em `src/shared/validacao_arquivos.py` por `rejeitar_anexos_embutidos(json)`, que levanta `ValidacaoNegocioError` (422) orientando a usar `POST /arquivos/questionario/{aba}` quando houver `conteudo_base64`; ajustar os usos em `src/services/ingresso/ingresso_service.py` (`atualizar_plano`) e `src/repository/questionario/questionario_rep.py` (`gravar_questionario`) e reescrever `tests/unit/shared/test_validacao_anexos_json.py` e os testes de `tests/unit/services/test_ingresso_service.py` e `tests/unit/routers/test_questionario_router.py` que enviavam base64
- [X] T057 [US2] Fazer `atualizar_plano` (`src/services/ingresso/ingresso_service.py`) e `gravar_questionario` (`src/repository/questionario/questionario_rep.py`) aplicarem `preservar_arquivos`, de modo que o `PUT`/`POST /questionario` nunca inclua, remova ou altere referências; testes em `tests/unit/services/test_ingresso_service.py` e `tests/unit/repository/test_questionario_repository.py`
- [X] T058 [US2] Em `IngressoRepository.arquivar_e_criar_novo` (`src/repository/ingresso/ingresso_rep.py`), reescrever o `caminho` das referências do questionário arquivado para a pasta arquivada (`<e-mail sem @ e .>_<n>`, a mesma regra de `arquivar_pasta` em `src/shared/armazenamento.py`), mantendo no novo questionário as referências da pasta vigente; testes em `tests/unit/repository/test_ingresso_repository.py`
- [X] T059 [US2] Criar `src/services/arquivos/arquivos_service.py` e `src/repository/arquivos/arquivos_rep.py`: `verificar_edicao(email)` (404 sem questionário; 409 fora de `iniciado|pendente|aprovado`), `registrar(email, aba, arquivos)` e `remover(email, aba, nomes)` com `SELECT ... FOR UPDATE`, reatribuindo um novo dict ao JSONB e preenchendo `atualizado_em/por`; testes em `tests/unit/services/test_arquivos_service.py`
- [X] T060 [US2] Alterar `POST /arquivos/questionario/{aba}` em `src/routers/arquivos/r_arquivos.py`: validar que `aba` é uma etapa existente (`etapa_existe`, 422), chamar `verificar_edicao` antes de gravar, e depois de salvar os arquivos chamar `registrar` com `{nome, tipo, tamanho, caminho}`; se `registrar` falhar, apagar os arquivos recém-gravados; incluir `caminho` em cada item de `arquivos_recebidos`
- [X] T061 [US2] Alterar `DELETE /arquivos/questionario/{aba}` em `src/routers/arquivos/r_arquivos.py`: chamar `verificar_edicao`, apagar os arquivos e então `remover` as referências correspondentes (inclusive de arquivo referenciado que já não exista em disco), mantendo a resposta `arquivos_deletados`/`erros`
- [X] T062 [US2] Testes em `tests/unit/routers/test_arquivos_router.py` e `tests/unit/routers/test_isolamento_dados.py`: upload cria a referência com `caminho` em `json_questionario[aba].arquivos`; reenviar o mesmo nome não duplica; aba inexistente → 422; pedido em `aguardando_aprovacao`/`rejeitado` → 409 e sem questionário → 404 (nenhum arquivo fica em disco); `DELETE` remove arquivo e referência; `PUT` do questionário não altera `arquivos[]`; `PUT` com `conteudo_base64` → 422; outro incubado não anexa nem remove
- [X] T063 [US2] Atualizar o plano nos documentos (já descrito em `contracts/api.md`, `data-model.md`, `research.md` §8 e §11, `spec.md` FR-015/FR-015a, `quickstart.md`, `README.md`) e o diagrama `docs/arquitetura.svg`/`.png` (camada de serviços e domínio: `ArquivosService`, anexos por referência)
- [X] T064 Rodar `./run-tests.sh`, `uv run ruff check . && uv run ruff format --check .` e `tests/validate_imports.py`, e repetir o roteiro de anexos do `quickstart.md` contra um Postgres real (upload → referência em `GET /questionario` → `PUT` preserva → `DELETE` remove)

## Phase 10: Ajuste - etapa 1 não tem nota (US3)

**Goal**: a etapa 1 (Setor de atuação) é só identificação: não tem `nota` no JSON e não pode ser avaliada (FR-010b). As etapas 2 a 9 seguem como estão.

**Independent Test**: como consultor, `PUT /usuarios/{email}/avaliacoes/1` devolve 422 e `PUT .../2` continua gravando; `GET /etapas` traz `avaliavel=false` só na etapa 1; ao salvar o questionário, `json_questionario["1"]` não ganha `nota` (e perde a que vier do cliente), enquanto `"2"` a `"9"` ganham `nota` vazia (roteiro 4 do `quickstart.md`).

- [X] T065 [P] [US3] Em `src/domain/models/questionarios/etapas.py`, adicionar o campo `avaliavel: bool = True` ao dataclass `Etapa`, marcar a etapa 1 com `avaliavel=False` e criar `etapa_avaliavel(etapa_id) -> bool` (False para id inexistente ou etapa 1); teste em `tests/unit/domain/test_etapas.py`
- [X] T066 [P] [US3] Criar `EtapaNaoAvaliavelError(NegocioError)` (`status_code = 422`, mensagem "A etapa {id} não tem nota.") em `src/shared/exceptions/negocio_exceptions.py` e exportá-la em `src/shared/exceptions/__init__.py`; teste em `tests/unit/test_exceptions.py`
- [X] T067 [US3] Em `src/domain/models/questionarios/notas.py`, fazer `mesclar_preservando_notas` e `zerar_notas` ignorarem etapas com `avaliavel=False`: a aba 1 nunca recebe `nota_vazia()` e uma `nota` que já exista nela (vinda do cliente ou de dados antigos) é removida; `notas_avaliadas` pula etapas não avaliáveis; ajustar o docstring do módulo ("`"2"` a `"9"`"); testes em `tests/unit/domain/test_notas.py` (hoje o caso de `{"1": {"cnpj": "1"}}` espera `nota` vazia na aba 1)
- [X] T068 [US3] Em `src/services/avaliacoes/avaliacoes_service.py` (`avaliar`), logo após `etapa_existe`, levantar `EtapaNaoAvaliavelError` quando `not etapa_avaliavel(etapa_id)`, antes de qualquer acesso ao banco além da checagem de perfil; testes em `tests/unit/services/test_avaliacoes_service.py` (etapa 1 → `EtapaNaoAvaliavelError` e o JSON fica intacto; etapa 2 continua gravando)
- [X] T069 [P] [US3] Adicionar `avaliavel: bool` a `EtapaOutput` em `src/domain/schemas/ingresso_schema.py` e preenchê-lo em `GET /etapas` (`src/routers/ingresso/r_ingresso.py`); testes em `tests/unit/routers/test_ingresso_router.py` (`avaliavel=false` só na etapa 1)
- [X] T070 [US3] Testes de rota em `tests/unit/routers/test_avaliacoes_router.py` (`PUT /usuarios/{email}/avaliacoes/1` → 422 com `{"mensagem": ...}` para consultor) e em `tests/unit/services/test_ingresso_service.py` (`atualizar_plano` não cria `nota` na aba 1, descarta a enviada e preserva as das abas 2 a 9; `reiniciar` não cria `nota` na aba 1)
- [X] T071 [P] [US3] Atualizar `README.md` (rota de avaliações e `GET /etapas`) e `docs/diagrama-de-classes.md` (`Etapa.avaliavel`; `EtapaJson.nota` opcional, ausente na etapa 1) e `docs/arquitetura.svg`/`.png` se citarem nota em todas as etapas
- [X] T072 Rodar `./run-tests.sh`, `uv run ruff check . && uv run ruff format --check .` e `tests/validate_imports.py`

**Dependências**: T065 e T066 antes de T067–T069; T070 depois de T067–T069; T072 por último. Dados antigos com `nota` na aba 1 não precisam de migração: são limpos no próximo salvamento (T067).

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → histórias**: Setup (Alembic) e Foundational bloqueiam todas as histórias.
- **US1 (P1)** depende só da Phase 2. Adiciona `situacao_incubacao` ao `User`, que as demais histórias usam.
- **US2 (P2)** depende de US1 (plano aprovado e `PUT /questionario` ajustado).
- **US3 (P3)** depende só de US1 (usuário incubado e questionário); a nota fica em `json_questionario`, então não há dependência de tabelas da US2.
- **US4 (P4)** depende de US1 e US3.
- Dentro de cada história: testes → models → migração → schemas → repositório → serviço → router.
- **Phase 9** (anexos por referência) depende das fases 3 a 8; T055 precede T056–T061, T059 precede T060/T061 e T062 só roda depois delas.
- **Phase 10** (etapa 1 sem nota) depende da US3 e da Phase 9: T065 e T066 precedem T067–T069, T070 vem depois de T067–T069 e T072 por último.
- As fases 8 a 10 são ajustes incrementais sobre as histórias e ficam antes desta seção por ordem de execução.
- Migrações são sequenciais: respeitar a ordem dos `down_revision` (`0001` baseline → `0002` ingresso e situação → `0003` última avaliação).

## Parallel Opportunities

- Phase 2: T006–T009 em paralelo (arquivos distintos).
- US1: os três arquivos de teste e o model `Questionario` e as colunas novas do `User` em paralelo.
- US3: testes e models em paralelo; schemas em paralelo com models.
- US4: testes e schemas em paralelo.
- Com mais de uma pessoa: após US1, US2 e US3 podem seguir em paralelo (exceto a migração, que é serializada).

## Implementation Strategy

1. **MVP**: Phase 1 + Phase 2 + US1 — a incubadora já recebe, aprova e rejeita candidatos.
2. Entregar US2 (plano) e US3 (avaliações) em incrementos independentes.
3. US4 fecha a gestão (painel, situação); a equipe (admin, colaborador, consultor) é criada pelo script de T008, desde a Phase 2.
4. Polish ao final.

## Phase 11: Convergence

- [X] T073 CRITICAL: mover as regras de negócio de `QuestionarioRepository.gravar_questionario` (`rejeitar_anexos_embutidos`, `zerar_notas`, `preservar_arquivos`) em `src/repository/questionario/questionario_rep.py` para um novo `QuestionarioService` (`src/services/questionario/questionario_service.py`, métodos `criar` e `buscar`), deixando o repositório só com acesso a dados; fazer `POST /questionario` e `GET /questionario` em `src/routers/questionario/r_questionario.py` chamarem o serviço em vez de `QuestionarioRepository` direto; ajustar `tests/unit/repository/test_questionario_repository.py`, `tests/unit/routers/test_questionario_router.py` e `tests/unit/services/test_questionario_service.py` per Constitution I (contradicts)
- [X] T074 Constitution V: trocar o `ValueError` de `IngressoRepository.arquivar_e_criar_novo` (`src/repository/ingresso/ingresso_rep.py`) por uma exceção de `src/shared/exceptions` (`ConflitoError`), mantendo a checagem de status `rejeitado` apenas no serviço (`IngressoService.reiniciar`); ajustar `tests/unit/repository/test_ingresso_repository.py` e `tests/unit/services/test_ingresso_service.py` per Constitution V (contradicts)
- [X] T075 Corrigir `specs/001-gestao-incubacao/research.md` §4: as dependências citadas `exigir_admin` e `exigir_proprio_incubado_ou_equipe` não existem; listar as reais (`exigir_colaborador`, `exigir_consultor`, `exigir_acesso_incubado`) per plan: shared/permissoes.py (contradicts)
