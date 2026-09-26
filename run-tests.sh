#!/bin/bash

# Script para rodar testes no docker-compose
# Cria os containers de teste, roda os testes e finaliza tudo se passar

set -e

echo "🐳 Iniciando containers de teste..."
docker-compose up --build db_test tests

# Captura o exit code do container de testes
TEST_EXIT_CODE=$(docker-compose ps -q tests | xargs docker inspect --format='{{.State.ExitCode}}')

if [ "$TEST_EXIT_CODE" -eq 0 ]; then
    echo "✅ Testes passaram com sucesso!"
    echo "🧹 Limpando containers de teste..."
    docker-compose down
    exit 0
else
    echo "❌ Testes falharam com código: $TEST_EXIT_CODE"
    echo "📋 Logs do container de teste disponíveis acima"
    echo "🧹 Limpando containers de teste..."
    docker-compose down
    exit 1
fi
