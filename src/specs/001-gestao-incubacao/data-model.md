# Data Model: Gestão de Incubação

Convenções: tabelas em português (`snake_case`), tabelas novas usam `criado_em/criado_por`
(`MixinDate`) quando o autor importa; chaves de pessoa por **e-mail** onde o código atual já faz
isso (`questionario.usuario_email`). Nada é apagado fisicamente (FR-011, FR-013).

## Existentes (alterações)

**user** (`infra/db.py`) — o candidato **é** o usuário cadastrado via fastapi-users; não há entidade
"incubado" separada: incubado = `User` com `is_incubado=true` cujo `questionario` está `aprovado`.
Novas colunas: `situacao_incubacao` (Enum `ativo|concluido|desistente`, nullable; definida como
`ativo` na aprovação do ingresso), `situacao_alterada_em` (DateTime(timezone=True), nullable),
`situacao_alterada_por` (String(255), nullable). Perfis: `is_admin`, `is_colaborador`,
`is_consultor`, `is_incubado`. Regra: exatamente um perfil verdadeiro por conta (a equipe é criada por
script; a desativação de contas pelo admin está adiada).

**questionario** — plano de negócio. Cada usuário tem **no máximo um questionário vigente**
(`usuario_email` é a PK e igual ao e-mail do usuário). O histórico de questionários rejeitados
fica na própria tabela, **arquivado pela renomeação da chave**:
- Quando o candidato com questionário `rejeitado` pede novo questionário, em uma única transação:
  (1) a linha rejeitada tem `usuario_email` alterado para `<email>_<n>`, onde `n` é a ordem do
  questionário (1 = primeiro enviado, 2 = segundo...), calculada como (quantidade de linhas já
  arquivadas do usuário) + 1; (2) é criada nova linha com `usuario_email = <email>`, status
  `pendente` e `json_questionario` copiado do rejeitado (o candidato corrige em vez de reescrever).
- Linhas arquivadas são somente leitura e **não** têm FK para `user` (a chave deixa de ser um
  e-mail). Para listá-las: chave que casa exatamente `^<email>_[0-9]+$`.
- Os anexos acompanham: a pasta de upload é copiada para a do arquivado (`<email sem @ e .>_<n>`) e a
  vigente é mantida. No JSON do arquivado, o `caminho` de cada referência passa a apontar para a
  pasta arquivada; o novo questionário mantém as referências da pasta vigente.
- Exemplo: 1º enviado e rejeitado → ao iniciar o 2º, o 1º vira `ana@x.com_1` e o 2º é `ana@x.com`;
  se o 2º for rejeitado e vier um 3º, o 2º vira `ana@x.com_2`.
- Novas colunas: `decidido_por`, `decidido_em`, `motivo_decisao` (nulos até haver decisão) e
  `ultima_avaliacao_em` (data da última nota gravada; evita ler o JSON no painel).
- `status_questionario`: `iniciado → pendente → aguardando_aprovacao → aprovado | rejeitado`;
  `rejeitado` encerra a linha (é arquivada ao iniciar novo questionário, FR-004a). `aprovado`
  permanece aprovado quando o incubado revisa o plano: a revisão atualiza a linha vigente
  (`atualizado_em/por`), sem versões e sem nova aprovação.

## Novas

**Anexos (sem tabela própria)** — arquivos em disco (`questionarios/<e-mail sem @ e .>/<aba>/<nome>`) e
referenciados em `questionario.json_questionario[<aba>].arquivos[]` como
`{nome, tipo, tamanho, caminho}` (`caminho` relativo à pasta de uploads). A lista é mantida só pelo
servidor: o endpoint de arquivos inclui/remove, e o `PUT` das respostas a preserva. Reenviar o
mesmo nome substitui a referência (chave: `caminho`). Anexo com `conteudo_base64` no JSON é
recusado.

**Avaliação (sem tabela própria)** — vive em `questionario.json_questionario[<etapa>].nota`, que o
frontend já usa: `{valor, texto, avaliador, avaliado_em}`.
- `valor`: inteiro 1–5 (null = etapa ainda sem nota); `texto`: parecer (obrigatório ao avaliar);
  `avaliador`: e-mail do consultor; `avaliado_em`: data/hora ISO (campo novo, ignorado pelo frontend).
- A etapa 1 (Setor de atuação) **não tem `nota`**: `etapas.py` marca `avaliavel=False` e o JSON dela traz só `arquivos[]` e as respostas. As etapas 2 a 9 sempre têm `nota` (vazia até serem avaliadas).
- Uma nova avaliação da etapa substitui a anterior (sem histórico). Escrita só por consultor, em leitura-modificação-escrita com bloqueio de linha; o `PUT` do incubado preserva
  as notas já gravadas (descarta as que vierem no corpo). Ao reiniciar um questionário rejeitado,
  o novo nasce com as notas zeradas (o arquivado mantém as originais).

## Definidas em código

**etapas** (`domain/models/questionarios/etapas.py`): lista ordenada `{id, titulo, ativa, avaliavel}` das etapas (`avaliavel=False` só na etapa 1).
Validação: a etapa avaliada MUST existir na lista vigente ou em etapa histórica mantida na
lista como `ativa=false`.

## Regras de validação (do spec)

- E-mail único por conta (FR-002), já garantido por fastapi-users.
- Rejeição exige `motivo_decisao` (FR-004).
- `nota` inteira 1–5; `parecer` não vazio (FR-010).
- Consultor só cria avaliação se `user.situacao_incubacao = ativo` para o incubado
  (FR-010; só etapas já respondidas podem ser avaliadas — etapa sem resposta retorna erro 422).
