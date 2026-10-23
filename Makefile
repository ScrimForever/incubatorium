# Dois grupos de containers, dois projetos compose:
#   app    -> docker-compose.yml        (backend, frontend, bancos, testes)
#   signoz -> signoz/pours/deployment/compose.yaml  (gerado pelo Foundry a partir de signoz/casting.yaml)
# Falam pela rede externa `observabilidade`. Use `make help`.

APP    := docker compose -f docker-compose.yml
SIGNOZ := docker compose -f signoz/pours/deployment/compose.yaml

.DEFAULT_GOAL := help
.PHONY: help network up down restart ps logs logs-app logs-signoz \
        up-app down-app up-signoz down-signoz test signoz-forge clean

help: ## Lista os comandos
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-14s %s\n", $$1, $$2}'

network:
	@docker network inspect observabilidade >/dev/null 2>&1 || docker network create observabilidade >/dev/null

up: network ## Sobe SigNoz e a aplicação
	$(SIGNOZ) up -d
	$(APP) up -d --build -V web frontend

down: ## Para tudo (mantém os dados)
	$(APP) down
	$(SIGNOZ) down

restart: down up ## Reinicia tudo

ps: ## Estado dos dois grupos
	$(APP) ps
	$(SIGNOZ) ps

logs: ## Logs dos dois grupos (Ctrl+C sai)
	@$(APP) logs -f --tail=50 & $(SIGNOZ) logs -f --tail=50; wait

up-app: network ## Sobe só a aplicação
	$(APP) up -d --build -V web frontend

down-app: ## Para só a aplicação
	$(APP) down

up-signoz: network ## Sobe só o SigNoz
	$(SIGNOZ) up -d

down-signoz: ## Para só o SigNoz
	$(SIGNOZ) down

logs-app: ## Logs da aplicação
	$(APP) logs -f --tail=100

logs-signoz: ## Logs do SigNoz
	$(SIGNOZ) logs -f --tail=100

test: ## Roda a suíte de testes (container `tests` + banco de teste)
	$(APP) run --rm tests

signoz-forge: ## Regera os manifestos do SigNoz (requer foundryctl)
	cd signoz && foundryctl --no-ledger --no-updater forge -f casting.yaml

clean: ## Para tudo e APAGA os volumes (dados do banco e do SigNoz)
	$(APP) down -v
	$(SIGNOZ) down -v
