# Script para executar testes do projeto
# Uso: .\run-tests.ps1 [opções]
# Opções: -verbose, -coverage, -html, -specific <caminho>

param(
    [switch]$verbose,
    [switch]$coverage,
    [switch]$html,
    [string]$specific
)

Write-Host "🧪 Iniciando testes..." -ForegroundColor Cyan

$pythonCmd = "pytest"
$args = @()

if ($specific) {
    $args += $specific
} else {
    $args += "tests/"
}

if ($verbose) {
    $args += "-v"
    Write-Host "📝 Modo verbose ativado" -ForegroundColor Yellow
}

if ($coverage) {
    $args += "--cov=src"
    $args += "--cov-report=term-missing"
    Write-Host "📊 Cobertura de testes ativada" -ForegroundColor Yellow
}

if ($html) {
    $args += "--cov=src"
    $args += "--cov-report=html"
    Write-Host "📄 Gerando relatório HTML" -ForegroundColor Yellow
}

# Executar pytest
& $pythonCmd @args

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Testes concluídos com sucesso!" -ForegroundColor Green

    if ($html) {
        Write-Host "📂 Relatório disponível em: htmlcov/index.html" -ForegroundColor Green
    }
} else {
    Write-Host "❌ Alguns testes falharam!" -ForegroundColor Red
    exit 1
}
