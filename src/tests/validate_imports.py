"""
Script de validação de importações para testes.
Executa antes dos testes para garantir que todas as importações funcionam corretamente.
"""

import sys
from pathlib import Path

src_path = str(Path(__file__).parent.parent)
if src_path not in sys.path:
    sys.path.insert(0, src_path)

print(f"[IMPORT VALIDATION] Python path: {src_path}")
print(f"[IMPORT VALIDATION] Current working directory: {Path.cwd()}")
print(f"[IMPORT VALIDATION] Python version: {sys.version}")

critical_modules = [
    "domain.models.base_models",
    "infra.db",
    "domain.models.user_model",
    "routers.questionario.r_questionario",
    "services",
    "repository",
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

print("\n[IMPORT VALIDATION] Testando redirecionamento src.*...\n")

try:
    import importlib.util

    spec = importlib.util.find_spec("src.domain.models.base_models")
    if spec:
        print("✓ src.domain.models.base_models (com redirecionamento)")
        success_count += 1
    else:
        print("✗ src.domain.models.base_models - módulo não encontrado")
        failure_count += 1
except (ImportError, AttributeError, ValueError) as e:
    print(f"✗ src.domain.models.base_models - Error: {e}")
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
