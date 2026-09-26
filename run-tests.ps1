# Script para rodar testes no docker-compose (Windows)
# Cria os containers de teste, roda os testes e finaliza tudo se passar

Write-Host "🐳 Iniciando containers de teste..." -ForegroundColor Cyan

# Inicia docker-compose com build
docker-compose up --build db_test tests

# Captura o exit code do container de testes
$testContainer = docker-compose ps -q tests
$exitCode = (docker inspect --format='{{.State.ExitCode}}' $testContainer)

if ($exitCode -eq 0) {
    Write-Host "✅ Testes passaram com sucesso!" -ForegroundColor Green
    Write-Host "🧹 Limpando containers de teste..." -ForegroundColor Yellow
    docker-compose down
    exit 0
} else {
    Write-Host "❌ Testes falharam com código: $exitCode" -ForegroundColor Red
    Write-Host "📋 Logs do container de teste disponíveis acima" -ForegroundColor Yellow
    Write-Host "🧹 Limpando containers de teste..." -ForegroundColor Yellow
    docker-compose down
    exit 1
}
