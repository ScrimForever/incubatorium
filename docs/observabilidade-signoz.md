# Observabilidade com SigNoz — o que foi feito

Os dois grupos de containers estão montados, mas o fluxo completo (app → SigNoz) ainda não foi provado. Falta criar a conta admin no SigNoz (veja "Pendências").

## Como ficou

- **Aplicação** (backend, frontend, bancos, testes): continua no `docker-compose.yml`.
- **SigNoz**: roda em compose próprio, em `signoz/pours/deployment/compose.yaml`. O SigNoz não distribui mais o compose pronto, só o Foundry, então o arquivo foi gerado com o `foundryctl` a partir de `signoz/casting.yaml`.
- **Comunicação entre os dois**: pela rede externa `observabilidade`. No `casting.yaml`, um patch coloca o coletor do SigNoz nessa rede com o alias `signoz-ingester`. O `web` entra nela, com `OTEL_EXPORTER_OTLP_ENDPOINT=http://signoz-ingester:4317` e `OTEL_HABILITADO=true` por padrão.
- **Comandos** (`Makefile` na raiz, `make help` lista todos):

| Comando | O que faz |
|---|---|
| `make up` / `make down` / `make restart` | Sobe, para ou reinicia os dois |
| `make up-app` / `make up-signoz` (e `down-*`) | Só um grupo |
| `make ps`, `make logs`, `make logs-app`, `make logs-signoz` | Estado e logs |
| `make test` | Roda a suíte (container `tests` + banco de teste) |
| `make signoz-forge` | Regera os manifestos (precisa do `foundryctl`) |
| `make clean` | Para tudo e apaga os volumes |

## Instrumentação do backend

- `infra/observabilidade.py`: `configurar_observabilidade(app, engine, settings)` envia por OTLP/gRPC:
  - **Traces:** FastAPI (requisições), SQLAlchemy e asyncpg (consultas).
  - **Métricas:** exportadas periodicamente.
  - **Logs:** os logs do loguru viram registros OTLP e levam o trace/span ativo, então dá para ir do log ao trace no SigNoz.
- `infra/config.py`: variáveis `OTEL_HABILITADO` (padrão `false` fora do compose), `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT` (padrão `http://localhost:4317`) e `OTEL_EXPORTER_OTLP_HEADERS`. No SigNoz Cloud, use `signoz-ingestion-key=<chave>` em `OTEL_EXPORTER_OTLP_HEADERS`.
- `startapp.py`: chama a configuração logo depois de registrar os handlers.
- Dependências novas em `pyproject.toml` e `uv.lock`: `opentelemetry-sdk`, `opentelemetry-exporter-otlp-proto-grpc` e as instrumentações de FastAPI, SQLAlchemy e asyncpg.
- Testes em `tests/unit/infra/test_observabilidade.py` (leitura dos headers e caso desligado) e seção "Observabilidade (SigNoz)" no `src/README.md`.

## Log por requisição e usuário logado

- `shared/log_requisicao.py`: uma linha por requisição (`GET /rota 200 12ms usuario=... trace_id=...`), com os campos `usuario`, `trace_id`, `http_status` e `duracao_ms` como atributos filtráveis no SigNoz. O `enduser.id` também vai para o span.
- `current_active_user` (e o hook `on_after_login`) guardam o e-mail do usuário logado na requisição. Sem login, sai `usuario=anonimo`. O e-mail digitado num login que falha nunca é gravado.
- Os logs do uvicorn (acesso) também são enviados ao SigNoz.

## Span por função (variáveis e tempo)

- `infra/instrumentacao.py`: cada função do projeto vira um span, com a duração do próprio span e os atributos `code.args.*` (argumentos), `code.vars.*` (variáveis locais ao terminar) e `code.return`. Exceções marcam o span com erro. As chamadas ficam aninhadas, junto com os spans de SQL.
- Usa `sys.monitoring` (Python 3.12+) sobre o código já carregado, sem decorators. Funciona em rotas e dependências do FastAPI. Ignora geradores e `async` geradores (como `get_async_session`).
- **Privacidade:** nomes como senha, token, secret, hash, cookie e authorization são mascarados (`***`) e os textos truncados em 300 caracteres. O resto (e-mails, conteúdo do questionário) é gravado. Liga com `OTEL_RASTREAR_FUNCOES=true` (padrão `false`; o `docker-compose.yml` liga em desenvolvimento). Em produção, avalie o impacto de privacidade e desempenho antes de ligar.

## O que foi verificado

- Os dois composes validam com `docker compose config`.
- A stack do SigNoz subiu e a API dele responde (`/api/v1/health` com 200).
- O `web` resolve `signoz-ingester` pela rede compartilhada e ativa a observabilidade.
- A suíte pytest local segue com 249 passando. `make test` (no container) não foi rodado.

## Pendências

1. **Criar a conta admin do SigNoz.** O coletor só aceita dados depois do primeiro cadastro em http://localhost:8080. Sem isso, o SigNoz recusa o agente com "cannot create agent without orgId" e o backend recebe "connection refused" na porta 4317. Depois de criar a conta, confira os traces no SigNoz.
2. **O SigNoz está rodando agora**, junto com o `web` e o `frontend`. `make down` para tudo e mantém os dados.

## Ajustes feitos no caminho

- **`up` não roda mais os testes:** ele sobe só `web` e `frontend` (mais o banco, por dependência). Antes, o `up -d` também disparava o container `tests`.
- **Dependências novas no container:** o `up` usa `-V` para renovar o volume anônimo do `.venv`. Ele estava fixo com as dependências antigas e faltava o `opentelemetry`.
- **Imagens do SigNoz em `latest`:** é o que o Foundry gera por padrão; vale fixar uma versão no `casting.yaml` antes de ir para produção.

## Estado do git

Tudo está na branch `feature/signoz`, sem commit.
