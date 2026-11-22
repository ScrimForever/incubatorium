# Containers da aplicação (backend, frontend, bancos, testes). Use `make help`.

APP := docker compose -f docker-compose.yml

# Linux/macOS: containers rodam com o seu UID/GID, então logs/__pycache__ criados
# no bind mount ficam com o seu dono. No Windows (Docker Desktop) roda como root.
ifneq ($(OS),Windows_NT)
export APP_UID ?= $(shell id -u)
export APP_GID ?= $(shell id -g)
endif

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
