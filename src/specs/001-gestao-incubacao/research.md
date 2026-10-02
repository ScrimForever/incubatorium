# Research: Gestão de Incubação

## 1. Pedido de ingresso × questionário existente
- **Decision**: o `Questionario` atual (uma linha por e-mail, `status_questionario` com
  `aguardando_aprovacao/aprovado/rejeitado`) continua sendo o plano de negócio **vigente**. O
  pedido de ingresso é o envio dele (status `aguardando_aprovacao`).
- **Rationale**: o spec define "o questionário é o plano de negócio" e o fluxo de status já
  existe no código.
- **Alternatives**: criar entidade separada de pedido (duplica o estado já presente).

## 2. Histórico de questionários rejeitados
- **Decision**: o histórico fica na própria tabela `questionario`. Ao iniciar novo questionário
  após uma rejeição, a linha rejeitada é arquivada renomeando sua chave para `<email>_<n>` (n =
  ordem do questionário) e uma nova linha vigente é criada com a chave `<email>` (decisão do
  produto). Revisões de plano já aprovado atualizam a linha vigente, sem versões.
- **Rationale**: preserva a PK 1:1 vigente (rotas e testes atuais seguem valendo) e mantém o
  histórico consultável sem tabela extra.
- **Alternatives**: tabela `questionario_versao` (descartada); remover a PK única (quebra rotas
  atuais). **Cuidados**: arquivadas perdem a FK para `user`; busca do histórico por casamento
  exato `^<email>_[0-9]+$`; a renomeação e a criação da nova linha ocorrem na mesma transação.

## 3. Etapas do questionário
- **Decision**: etapas definidas em módulo Python (`etapas.py`: id estável, título, ordem),
  alinhadas às "abas" que o upload de arquivos já usa. Avaliações guardam o id da etapa, não
  uma FK.
- **Atualização**: cada etapa tem o atributo `avaliavel` (padrão `True`); a etapa 1 (Setor de
  atuação) é `avaliavel=False` por decisão de produto: é só identificação, sem nota.
- **Rationale**: clarificação diz que só mudam por código; id estável preserva avaliações
  antigas quando o texto muda (FR-010a).
- **Alternatives**: tabela de etapas editável (rejeitado pelo usuário).

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
  (`{valor, texto, avaliador, avaliado_em}`), como o frontend já espera. Sem tabela de avaliações,
  sem histórico e sem recomendações. O consultor escreve com leitura-modificação-
  escrita sob bloqueio de linha, e o `PUT` do incubado preserva as notas existentes.
- **Exceção**: a etapa 1 não tem `nota` (`avaliavel=False`): `mesclar_preservando_notas` e
  `zerar_notas` não a criam; avaliá-la devolve `EtapaNaoAvaliavelError` (422) e `nota` vinda do
  cliente nela é descartada.
- **Rationale**: o frontend já lê e grava esse formato; evita duplicar a fonte de verdade.
- **Alternatives**: tabela `avaliacao` com histórico (descartada pelo produto); híbrido JSON +
  tabela (descartado).

## 8. Anexos
- **Decision** (produto): uploads só pelo endpoint de arquivos (multipart form, como já era); o JSON
  do questionário guarda a **referência** (`caminho`) de cada arquivo em `arquivos[]` da etapa, para
  facilitar inclusão e remoção. A lista é mantida pelo servidor (o `PUT` das respostas a preserva,
  como às notas) e anexo embutido em base64 é recusado. O endpoint valida aba, tipo, conteúdo e
  tamanho, e só altera arquivos com o questionário editável (`iniciado|pendente|aprovado`). Acesso de
  leitura para a equipe.
- **Rationale**: o JSON não carrega mais o conteúdo dos arquivos; a validação fica num só lugar e a
  remoção deixa de depender de comparar nomes.
- **Alternatives**: migrar para object storage (fora do escopo).

## 9. Migrações
- **Decision**: `alembic init` assíncrono em `src/migrations`, migração baseline gerada do
  esquema atual e migrações incrementais por agregado; remover `create_all` do `lifespan`.
- **Rationale**: Princípio IV. `pg_force_alembic` já existe em `infra/config.py`.
- **Alternatives**: continuar com `create_all` (viola a constituição).

## 10. Envio de e-mail e ajustes operacionais
- **Decision**: `EmailSetup.enviar_notificacao` (decisão do ingresso e nova avaliação) envia em
  qualquer ambiente, desde que `EMAIL_ENVIO_HABILITADO` seja verdadeiro (padrão) e `RESEND_API_KEY`
  esteja definida; testes e demos desligam com `EMAIL_ENVIO_HABILITADO=false`. Os e-mails de
  cadastro e redefinição de senha, anteriores à feature, mantêm o envio apenas em `development`.
- **Decision**: `EMAIL_DESTINO_OVERRIDE` redireciona todos os e-mails novos para um endereço de
  teste (homologação), evitando mensagens a usuários reais.
- **Decision**: `get_async_session` registra `NegocioError`, `HTTPException` e `RequestValidationError` como aviso (não como
  erro), para que 403/409/422 esperados (inclusive corpo inválido) não poluam os logs de erro.
- **Rationale**: FR-004/FR-016 exigem notificação fora de desenvolvimento; os dois ajustes são
  operacionais e pequenos.
- **Alternatives**: manter o envio só em `development` (feature inoperante em produção).

## 11. Concorrência nas notas
- **Decision**: tanto a avaliação do consultor quanto o `PUT` do incubado leem o questionário com
  `SELECT ... FOR UPDATE`, então um não sobrescreve o outro; as referências de anexos
  (`arquivos[]`) são gravadas sob o mesmo bloqueio de linha pelo endpoint de arquivos.
