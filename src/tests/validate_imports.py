"""
Script de validação de importações para testes.
Executa antes dos testes para garantir que todas as importações funcionam corretamente.
"""

import sys
from pathlib import Path

src_path = str(Path(__file__).parent.parent)
repo_root = str(Path(__file__).parent.parent.parent)
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)  # permite resolver o pacote `src`

print(f"[IMPORT VALIDATION] Python path: {src_path}")
print(f"[IMPORT VALIDATION] Current working directory: {Path.cwd()}")
print(f"[IMPORT VALIDATION] Python version: {sys.version}")

critical_modules = [
    "src.domain.models.base",
    "src.infra.db",
    "src.domain.models.usuario",
    "src.auth.backend",
    "src.routers.questionario",
    "src.routers.usuarios",
    "src.routers.arquivos",
    "src.routers.auth",
    "src.routers.dependencias",
    "src.services",
    "src.services.usuarios.usuarios_service",
    "src.repository",
    "src.repository.base",
    "src.repository.usuarios",
    "src.repository.questionario",
    "src.services.usuarios.ativacao_service",
    "src.services.questionario.questionario_service",
    "src.services.arquivos.arquivos_service",
    "src.shared.permissoes",
]

success_count = 0
failure_count = 0

print("\n[IMPORT VALIDATION] Iniciando validação de importações...\n")

for module_name in critical_modules:
    try:
        __import__(module_name)
        print(f"✓ {module_name}")
        success_count += 1
    except (ImportError, AttributeError, ValueError) as e:
        print(f"✗ {module_name} - Error: {e}")
        failure_count += 1

print(
    f"\n[IMPORT VALIDATION] Resumo: {success_count} sucesso(s), {failure_count} falha(s)"
)

if failure_count > 0:
    print("[IMPORT VALIDATION] ⚠️  Algumas importações falharam!")
    sys.exit(1)
else:
    print("[IMPORT VALIDATION] ✓ Todas as importações validadas com sucesso!")
    sys.exit(0)
