#!/bin/bash

# Script para executar testes do projeto
# Uso: ./run-tests.sh [opções]
# Opções: --verbose, --coverage, --html, --specific <caminho>

VERBOSE=false
COVERAGE=false
HTML=false
SPECIFIC_PATH="tests/"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --verbose)
            VERBOSE=true
            shift
            ;;
        --coverage)
            COVERAGE=true
            shift
            ;;
        --html)
            HTML=true
            shift
            ;;
        --specific)
            SPECIFIC_PATH="$2"
            shift 2
            ;;
        *)
            echo "Opção desconhecida: $1"
            exit 1
            ;;
    esac
done

echo "🧪 Iniciando testes..."

PYTEST_ARGS="$SPECIFIC_PATH"

if [ "$VERBOSE" = true ]; then
    PYTEST_ARGS="$PYTEST_ARGS -v"
    echo "📝 Modo verbose ativado"
fi

if [ "$COVERAGE" = true ]; then
    PYTEST_ARGS="$PYTEST_ARGS --cov=src --cov-report=term-missing"
    echo "📊 Cobertura de testes ativada"
fi

if [ "$HTML" = true ]; then
    PYTEST_ARGS="$PYTEST_ARGS --cov=src --cov-report=html"
    echo "📄 Gerando relatório HTML"
fi

# Execute pytest
pytest $PYTEST_ARGS

if [ $? -eq 0 ]; then
    echo "✅ Testes concluídos com sucesso!"
    if [ "$HTML" = true ]; then
        echo "📂 Relatório disponível em: htmlcov/index.html"
    fi
else
    echo "❌ Alguns testes falharam!"
    exit 1
fi
