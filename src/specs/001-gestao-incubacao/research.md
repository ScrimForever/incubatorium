# Research: Gestão de Incubação

## 1. Questionário existente como plano de negócio
- **Decision**: o `Questionario` atual (uma linha por e-mail, `status_questionario` com
  `aguardando_aprovacao/aprovado/rejeitado`) continua sendo o plano de negócio **vigente**. O
  fluxo de pedido de ingresso (envio, aprovação, rejeição e histórico) foi removido do sistema.
- **Rationale**: o spec define "o questionário é o plano de negócio" e o fluxo de status já
  existe no código.
- **Alternatives**: criar entidade separada de pedido (duplica o estado já presente).

## 2. Histórico de questionários rejeitados (removido)
- **Decision**: o arquivamento por renomeação de chave (`<email>_<n>`) foi removido junto com o
  fluxo de ingresso; cada usuário tem um único questionário, atualizado no lugar.

## 3. Etapas do questionário
- **Decision**: o backend não define etapas: o módulo `etapas.py` e `GET /etapas` foram removidos.
  O formato do `json_questionario` (abas numeradas, nota por aba) é do frontend; o id da aba é a
  chave do JSON e do upload de arquivos.
- **Rationale**: evita duplicar no servidor uma estrutura que o frontend já controla.
- **Alternatives**: tabela de etapas editável (rejeitado pelo usuário); lista em código (removida).

## 4. Perfis e permissões
- **Decision**: reutilizar as flags de `User` e criar dependências FastAPI em
  `shared/permissoes.py` (`exigir_colaborador`, `exigir_consultor`,
  `exigir_acesso_incubado`). Admin tem acesso total de gestão de contas, não de avaliação.
- **Decision**: qualquer consultor lê e avalia qualquer etapa de um incubado ativo (sem vínculo
  consultor↔incubado); incubado só acessa os próprios dados e colaborador vê todos.
- **Rationale**: o modelo já existe; evita nova tabela de papéis.
- **Alternatives**: tabela de papéis/RBAC (excessivo para 4 perfis fixos).

## 5. Cadastro por admin e primeiro admin
- **Decision**: **sem endpoints de admin nesta entrega** (adiados por decisão do produto). A equipe
  (admin, colaborador, consultor) é criada pelo script de implantação
  (`python -m src.scripts.criar_admin --perfil ... --email ... --password ...`), que ativa a conta
  diretamente e deixa exatamente um perfil verdadeiro. Fica para depois decidir como o admin
  gerencia contas pela aplicação (criação, atribuição de perfil, desativação). O primeiro admin é criado por script
  de implantação (`python -m src.scripts.criar_admin`) com credenciais por variável de ambiente e
  é ativado diretamente pelo script (não há fluxo de e-mail na implantação).
- **Rationale**: o registro público força `is_incubado=True`, então não eleva privilégio;
  a Assumption do spec exige admin inicial na implantação.
- **Alternatives**: seed automático no startup (segredo em subida de app, mais arriscado).

## 6. Metas (removidas do escopo)
- **Decision** (produto): metas, progresso e notificação de atraso foram removidos por não estarem no
  plano; o plano de negócio é só o questionário. Nenhuma tarefa agendada nem tabela de metas existe.

## 7. Nota e avaliação
- **Decision** (produto): a nota fica **só** em `json_questionario[etapa].nota`
  (`{valor, texto, avaliador, avaliado_em}`). Sem tabela de avaliações, sem histórico e sem
  recomendações. O consultor escreve com leitura-modificação-escrita sob bloqueio de linha
  (`SELECT ... FOR UPDATE`), e o `PUT` do incubado também bloqueia a linha, então um não
  sobrescreve o outro.
- **Limite atual**: o servidor não valida a etapa avaliada nem protege `nota` contra o `PUT` do cliente.
- **Rationale**: o frontend já lê e grava esse formato; evita duplicar a fonte de verdade.
- **Alternatives**: tabela `avaliacao` com histórico (descartada pelo produto).

## 8. Anexos
- **Decision**: uploads só pelo endpoint de arquivos (multipart form), que valida tipo, conteúdo e
  tamanho e só altera arquivos com o questionário editável (`iniciado|pendente|aprovado`). Os
  arquivos ficam em disco por etapa; o servidor não grava referências no JSON. Leitura para a equipe.
- **Alternatives**: migrar para object storage (fora do escopo).

## 9. Migrações
- **Decision**: `alembic init` assíncrono em `src/migrations`, migração baseline gerada do
  esquema atual e migrações incrementais por agregado; remover `create_all` do `lifespan`.
- **Rationale**: Princípio IV. `pg_force_alembic` já existe em `infra/config.py`.
- **Alternatives**: continuar com `create_all` (viola a constituição).

## 10. Envio de e-mail e ajustes operacionais
- **Decision**: `EmailSetup.enviar_notificacao` (nova avaliação) envia em
  qualquer ambiente, desde que `EMAIL_ENVIO_HABILITADO` seja verdadeiro (padrão) e `RESEND_API_KEY`
  esteja definida; testes e demos desligam com `EMAIL_ENVIO_HABILITADO=false`. Os e-mails de
  cadastro e redefinição de senha, anteriores à feature, mantêm o envio apenas em `development`.
- **Decision**: `EMAIL_DESTINO_OVERRIDE` redireciona todos os e-mails novos para um endereço de
  teste (homologação), evitando mensagens a usuários reais.
- **Decision**: `get_async_session` registra `NegocioError`, `HTTPException` e `RequestValidationError` como aviso (não como
  erro), para que 403/409/422 esperados (inclusive corpo inválido) não poluam os logs de erro.
- **Rationale**: FR-016 exige notificação fora de desenvolvimento; os dois ajustes são
  operacionais e pequenos.
- **Alternatives**: manter o envio só em `development` (feature inoperante em produção).
