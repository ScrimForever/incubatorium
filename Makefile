# Containers da aplicação (backend, frontend, bancos, testes). Use `make help`.

APP := docker compose -f docker-compose.yml

.DEFAULT_GOAL := help
.PHONY: help up down restart ps logs test clean

help: ## Lista os comandos
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-14s %s\n", $$1, $$2}'

up: ## Sobe a aplicação
	$(APP) up -d --build -V web frontend

down: ## Para tudo (mantém os dados)
	$(APP) down

restart: down up ## Reinicia tudo

ps: ## Estado dos containers
	$(APP) ps

logs: ## Logs da aplicação (Ctrl+C sai)
	$(APP) logs -f --tail=100

test: ## Roda a suíte de testes (container `tests` + banco de teste)
	$(APP) run --rm tests

clean: ## Para tudo e APAGA os volumes (dados do banco)
	$(APP) down -v
