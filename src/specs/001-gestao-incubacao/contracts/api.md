# Contrato da API: Gestão de Incubação

Autenticação: Bearer JWT (`/auth/jwt/login`, existente). Erros de negócio: JSON
`{"mensagem": "..."}`. Códigos: 401 sem login, 403 sem permissão, 404 inexistente, 409 conflito,
422 validação. Rotas existentes (`/auth/*`, `/users/*`, `/questionario`, `/arquivos/*`)
permanecem; apenas as marcadas **(alterada)** mudam.

Não existe recurso `/incubados`: o incubado é o usuário (fastapi-users) com `is_incubado`; rotas por pessoa usam `/usuarios/{email}/...`.

Perfis: **INC** incubado · **CON** consultor · **COL** colaborador · **ADM** admin.

## Questionário (US1)

| Método e rota | Perfil | Descrição |
|---|---|---|
| `PUT /questionario` **(alterada)** | INC | Grava o JSON do questionário vigente como enviado (404 sem questionário), preenchendo `atualizado_em/por`; não altera o status. `POST` e `PUT`: 422 se alguma chave `nota` do JSON (em qualquer nível) não for 1–5 (nula é aceita) |

## Plano de negócio (US2)

| Método e rota | Perfil | Descrição |
|---|---|---|
| `GET /usuarios/{email}/plano` | próprio INC, COL, CON | Questionário vigente |

## Gestão pelo colaborador (US4)

Endpoints de administração de contas pelo admin (criar equipe, atribuir perfil, ativar/desativar) estão **adiados**; por ora a equipe é criada pelo script `python -m src.scripts.criar_admin`.

| Método e rota | Perfil | Descrição |
|---|---|---|
| `GET /usuarios?perfil=incubado&situacao=` | COL | Visão consolidada dos usuários com `is_incubado`: situação, estado do plano |
| `PATCH /usuarios/{email}/situacao` | COL | `{situacao: ativo|concluido|desistente}` |

## Arquivos (FR-015)

Os anexos entram **só** por aqui (multipart form); ficam em disco, por etapa (`aba`).

| Método e rota | Perfil | Descrição |
|---|---|---|
| `POST /arquivos/questionario/{aba}` **(alterada)** | INC dono | Campo `arquivos` (um ou mais). Valida tipo, conteúdo e tamanho (422). Só com o questionário em `iniciado`, `pendente` ou `aprovado` (409 nos demais, 404 sem questionário). Grava em disco; reenviar o mesmo nome substitui. Resposta traz o `caminho` de cada arquivo |
| `DELETE /arquivos/questionario/{aba}` **(alterada)** | INC dono | Corpo: lista de nomes. Apaga os arquivos em disco. Mesmas restrições de estado do POST |
| `GET /arquivos/questionario/nome-arquivo/{aba}?email=` | INC dono, COL, CON | Nomes dos arquivos da etapa |
| `POST /arquivos/questionario/download/{aba}/{todos}?email=` | INC dono, COL, CON | Baixa um arquivo |

`caminho` é relativo à pasta de uploads: `<e-mail sem @ e .>/<aba>/<nome>`. O servidor não mantém
referências de arquivos no JSON do questionário.

## Notificações por e-mail (FR-016)

Sem eventos de notificação por avaliação (o recurso foi removido). A ativação de conta usa o e-mail de cadastro já existente.
