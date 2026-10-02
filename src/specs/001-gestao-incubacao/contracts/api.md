# Contrato da API: Gestão de Incubação

Autenticação: Bearer JWT (`/auth/jwt/login`, existente). Erros de negócio: JSON
`{"mensagem": "..."}`. Códigos: 401 sem login, 403 sem permissão, 404 inexistente, 409 conflito,
422 validação. Rotas existentes (`/auth/*`, `/users/*`, `/questionario`, `/arquivos/*`)
permanecem; apenas as marcadas **(alterada)** mudam.

Não existe recurso `/incubados`: o incubado é o usuário (fastapi-users) com `is_incubado`; rotas por pessoa usam `/usuarios/{email}/...`.

Perfis: **INC** incubado · **CON** consultor · **COL** colaborador · **ADM** admin.

## Ingresso (US1)

| Método e rota | Perfil | Descrição |
|---|---|---|
| `PUT /questionario` **(alterada)** | INC | Salva respostas do questionário vigente (bloqueado em `aguardando_aprovacao` e `rejeitado`); em incubado aprovado atualiza o plano vigente |
| `POST /ingresso/reiniciar` | INC com questionário `rejeitado` | Arquiva o rejeitado (`<email>_<n>`) e cria novo questionário `pendente` copiado dele |
| `POST /ingresso/enviar` | INC | Envia o questionário para análise (`aguardando_aprovacao`); permitido a partir de `pendente`/`iniciado`; após `rejeitado` é preciso `POST /ingresso/reiniciar` antes |
| `GET /ingresso?status=` | COL | Lista pedidos por status |
| `GET /ingresso/{email}/historico` | COL, próprio INC | Questionários rejeitados arquivados (`<email>_<n>`) com motivo e decisor |
| `POST /ingresso/{email}/aprovar` | COL | Aprova (`aprovado`, `situacao_incubacao=ativo`); notifica |
| `POST /ingresso/{email}/rejeitar` | COL | Corpo `{motivo}` obrigatório; notifica |

## Plano de negócio e etapas (US2/US3)

| Método e rota | Perfil | Descrição |
|---|---|---|
| `GET /etapas` | todos | Etapas vigentes (`id`, `titulo`, `ordem`, `avaliavel`; a etapa 1 vem com `avaliavel=false`) |
| `GET /usuarios/{email}/plano` | próprio INC, COL, CON | Questionário vigente |

## Avaliações (US3)

| Método e rota | Perfil | Descrição |
|---|---|---|
| `PUT /usuarios/{email}/avaliacoes/{etapa_id}` | CON | `{nota (1-5), parecer}`; grava em `json_questionario[etapa].nota`; substitui a anterior; etapa 1 não é avaliável (422); só com pedido `aguardando_aprovacao` ou `aprovado`, etapa respondida e incubado não encerrado |
| `GET /usuarios/{email}/avaliacoes` | próprio INC, COL, CON | Nota, parecer, avaliador e data de cada etapa avaliada |

## Gestão pelo colaborador (US4)

Endpoints de administração de contas pelo admin (criar equipe, atribuir perfil, ativar/desativar) estão **adiados**; por ora a equipe é criada pelo script `python -m src.scripts.criar_admin`.

| Método e rota | Perfil | Descrição |
|---|---|---|
| `GET /usuarios?perfil=incubado&situacao=` | COL | Visão consolidada dos usuários com `is_incubado`: situação, estado do plano, última avaliação |
| `PATCH /usuarios/{email}/situacao` | COL | `{situacao: ativo|concluido|desistente}` |

## Arquivos (FR-015)

Os anexos entram **só** por aqui (multipart form); o JSON do questionário guarda a referência.

| Método e rota | Perfil | Descrição |
|---|---|---|
| `POST /arquivos/questionario/{aba}` **(alterada)** | INC dono | Campo `arquivos` (um ou mais). Valida aba (1–9), tipo, conteúdo e tamanho (422). Só com o questionário em `iniciado`, `pendente` ou `aprovado` (409 nos demais, 404 sem questionário). Grava em disco e inclui em `json_questionario[aba].arquivos` a referência `{nome, tipo, tamanho, caminho}`; reenviar o mesmo nome substitui, sem duplicar. Resposta traz o `caminho` de cada arquivo |
| `DELETE /arquivos/questionario/{aba}` **(alterada)** | INC dono | Corpo: lista de nomes. Apaga o arquivo e remove a referência (mesmo se o arquivo já não existir em disco). Mesmas restrições de estado do POST |
| `GET /arquivos/questionario/nome-arquivo/{aba}?email=` | INC dono, COL, CON | Nomes dos arquivos da etapa |
| `POST /arquivos/questionario/download/{aba}/{todos}?email=` | INC dono, COL, CON | Baixa um arquivo |

`caminho` é relativo à pasta de uploads: `<e-mail sem @ e .>/<aba>/<nome>`. O `PUT`/`POST /questionario`
**não** altera `arquivos[]` (o servidor preserva a lista) e recusa (422) anexo com `conteudo_base64`.

## Notificações por e-mail (FR-016)

Eventos: decisão do pedido (ao candidato) e nova avaliação (ao incubado). A ativação de conta usa o e-mail de cadastro já existente.
