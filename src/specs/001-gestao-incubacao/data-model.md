# Data Model: Gestão de Incubação

Convenções: tabelas em português (`snake_case`), tabelas novas usam `criado_em/criado_por`
(`MixinDate`) quando o autor importa; chaves de pessoa por **e-mail** onde o código atual já faz
isso (`questionario.usuario_email`). Nada é apagado fisicamente (FR-011, FR-013).

## Existentes (alterações)

**user** (`infra/db.py`) — o candidato **é** o usuário cadastrado via fastapi-users; não há entidade
"incubado" separada: incubado = `User` com `is_incubado=true` cujo `questionario` está `aprovado`.
Novas colunas: `situacao_incubacao` (Enum `ativo|concluido|desistente`, nullable; definida como
`ativo`; nada a define hoje), `situacao_alterada_em` (DateTime(timezone=True), nullable),
`situacao_alterada_por` (String(255), nullable). Perfis: `is_admin`, `is_colaborador`,
`is_consultor`, `is_incubado`. Regra: exatamente um perfil verdadeiro por conta (a equipe é criada por
script; a desativação de contas pelo admin está adiada).

**questionario** — plano de negócio. Cada usuário tem **no máximo um questionário** vigente
(`usuario_email` é a PK e igual ao e-mail do usuário). Não há arquivamento nem histórico: o fluxo
de ingresso (envio, aprovação, rejeição e novo pedido) foi removido.
- Colunas de decisão `decidido_por`, `decidido_em`, `motivo_decisao` permanecem no modelo, mas nada as grava hoje.
  `ultima_avaliacao_em` guarda a data da última nota gravada (evita ler o JSON no painel).
- `status_questionario` (`iniciado|pendente|aguardando_aprovacao|aprovado|rejeitado`) permanece no
  modelo; o `PUT /questionario` não o altera. Nada no código o move para `aguardando_aprovacao`/`aprovado` hoje.
- O `PUT /questionario` grava o JSON como enviado, com `atualizado_em/por`, sob `SELECT ... FOR UPDATE`.

## Novas

**Anexos (sem tabela própria)** — arquivos em disco (`questionarios/<e-mail sem @ e .>/<aba>/<nome>`),
gravados e apagados só pelo endpoint de arquivos, que exige questionário editável
(`iniciado|pendente|aprovado`). O servidor não mantém referências no JSON do questionário.

**Avaliação (sem tabela própria)** — vive em `questionario.json_questionario[<etapa>].nota`:
`{valor, texto, avaliador, avaliado_em}`.
- `valor`: inteiro 1–5; `texto`: parecer (obrigatório); `avaliador`: e-mail do consultor; `avaliado_em`: data/hora ISO.
- Uma nova avaliação da etapa substitui a anterior (sem histórico). Escrita só por consultor, em
  leitura-modificação-escrita com bloqueio de linha. O servidor não valida a etapa (não há lista
  de etapas no backend) nem protege a `nota` contra o `PUT` do cliente: o JSON é do cliente.

## Regras de validação (do spec)

- E-mail único por conta (FR-002), já garantido por fastapi-users.
- `nota` inteira 1–5; `parecer` não vazio (FR-010).
- Consultor só cria avaliação se `user.situacao_incubacao = ativo` para o incubado
  (FR-010).
