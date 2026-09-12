# TecCampos — Frontend (Angular 20)

Interface do Incubatorium. Consome a API FastAPI que roda em Docker na raiz deste
repositório — **sem a API no ar, as telas mostram erro de conexão**.

## Pré-requisitos

- Node.js 20 ou superior
- A API e o banco de pé; na raiz do repositório:

```bash
docker compose up -d
```

## Rodar

```bash
npm install
npm start
```

- Frontend: <http://localhost:3000>
- API: <http://localhost:8000> · Swagger: <http://localhost:8000/docs>

O `proxy.conf.json` reescreve `/api/*` → `http://127.0.0.1:8000/*`, então o navegador
fala com uma origem só e não há CORS no caminho.

## Primeira conta

Todo usuário nasce com `is_active = false` e o login recusa conta inativa. A ativação
normal é pelo link do e-mail de cadastro, que devolve o navegador para `/conta-ativada`.
Sem passar pelo e-mail, ativar direto no banco:

```bash
docker compose exec db psql -U teccampos -d teccampos -c "UPDATE \"user\" SET is_active = true WHERE email = 'alguem@teccampos.com';"
```

Para entrar como administrador, marcar também `is_superuser = true` — é desse campo que
o papel é derivado hoje.

## Verificar

```bash
npm run lint
npm run format
npm run build
npm run test:ci
```

`test:ci` roda o Karma em Chrome headless, sem watch.

## Telas

| Rota | Tela | Acesso |
|---|---|---|
| `/login` | Entrar | pública |
| `/registro` | Criar conta | pública |
| `/esqueci-senha` | Pedir link de redefinição | pública |
| `/redefinir-senha?token=` | Definir nova senha | pública |
| `/conta-ativada` | Confirmação de ativação | pública |
| `/questionario` | Plano de negócios em nove etapas | incubado, plano em preenchimento |
| `/aguardando-aprovacao` | Plano em análise | incubado, plano enviado |
| `/plano-rejeitado` | Plano devolvido para ajustes | incubado, plano rejeitado |
| `/meu-plano` | Plano com a avaliação por etapa | incubado, plano aprovado |
| `/dashboard/:role` | Visão geral | incubado com plano aprovado; demais papéis |
| `/minha-conta` | Troca de e-mail e de senha | incubado com plano aprovado; demais papéis |
| `/usuarios` | Administração de contas | administrador |
| `**` | Página não encontrada | pública |

A tela do incubado logo após o login é decidida pelo status do plano: em preenchimento
abre o questionário, enviado abre o acompanhamento, devolvido abre a tela de ajustes e
aprovado libera o painel. Os demais papéis não passam por essa triagem.
