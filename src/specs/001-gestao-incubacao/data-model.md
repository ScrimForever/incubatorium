# Data Model: Gestão de Incubação

Convenções: tabelas em português (`snake_case`), tabelas novas usam `criado_em/criado_por`
(`MixinDate`) quando o autor importa; chaves de pessoa por **e-mail** onde o código atual já faz
isso (`questionario.usuario_email`, que não é chave primária). Nada é apagado fisicamente (FR-011, FR-013).

## Existentes (alterações)

**user** (`infra/db.py`) — o candidato **é** o usuário cadastrado via fastapi-users; não há entidade
"incubado" separada: incubado = `User` com `is_incubado=true` cujo `questionario` está `aprovado`.
Novas colunas: `situacao_incubacao` (Enum `ativo|concluido|desistente`, nullable; definida como
`ativo`; nada a define hoje), `situacao_alterada_em` (DateTime(timezone=True), nullable),
`situacao_alterada_por` (String(255), nullable). Perfis: `is_admin`, `is_colaborador`,
`is_consultor`, `is_incubado`. Regra: exatamente um perfil verdadeiro por conta (a equipe é criada por
script; a desativação de contas pelo admin está adiada).

**questionario** — plano de negócio. A chave primária é `id` (inteiro autoincremento);
`usuario_email` (e-mail do usuário, sem FK) **não é único** no banco, então a regra de um questionário por usuário
é aplicada só pelo código (`POST /questionario` devolve 409 se já existir). Não há arquivamento nem histórico: o fluxo
de ingresso (envio, aprovação, rejeição e novo pedido) foi removido.
- Colunas de decisão `decidido_por`, `decidido_em`, `motivo_decisao` permanecem no modelo, mas nada as grava hoje.
  A coluna `ultima_avaliacao_em` foi removida (migração `0004`) junto com o recurso de avaliações.
- `status_questionario` (`iniciado|pendente|aguardando_aprovacao|aprovado|rejeitado`) permanece no
  modelo; o `PUT /questionario` não o altera. Nada no código o move para `aguardando_aprovacao`/`aprovado` hoje.
- `POST` e `PUT /questionario` validam o JSON no schema Pydantic (`QuestionarioInputSchema`): toda chave `nota`, em qualquer nível, deve valer 1–5 (inteiro, ou `{valor, ...}` com `valor` 1–5) ou ser nula; caso contrário, 422. O `PUT` grava o JSON como enviado, com `atualizado_em/por`, sob `SELECT ... FOR UPDATE`.

## Novas

**Anexos (sem tabela própria)** — arquivos em disco (`questionarios/<e-mail sem @ e .>/<aba>/<nome>`),
gravados e apagados só pelo endpoint de arquivos, que exige questionário editável
(`iniciado|pendente|aprovado`). O servidor não mantém referências no JSON do questionário.

## Regras de validação (do spec)

- E-mail único por conta (FR-002), já garantido por fastapi-users.
- Chave `nota` no JSON do questionário, se presente, vale 1–5 (schema Pydantic); o backend não tem mais endpoints de avaliação.
