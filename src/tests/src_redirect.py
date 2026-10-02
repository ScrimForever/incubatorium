"""Redirecionamento de `src.*` para os módulos sem prefixo (usado pelos testes e pelo
`validate_imports.py`).

O código da aplicação importa `src.x`, mas os testes rodam de dentro de `src/`. Este finder
faz `src.x` e `x` serem o mesmo módulo, evitando definir as tabelas duas vezes.
"""

import importlib.abc
import importlib.machinery
import sys


class SrcRedirectFinder(importlib.abc.MetaPathFinder):
    """Redirect src.* imports to their non-src counterparts"""

    def find_spec(self, fullname, path, target=None):
        if fullname.startswith("src."):
            redirect_name = fullname[4:]  # Remove 'src.' prefix
            try:
                # Find the spec for the target module
                import importlib.util

                spec = importlib.util.find_spec(redirect_name)
                if spec and spec.loader:
                    # Return a spec that loads the redirect module under the src name
                    return importlib.machinery.ModuleSpec(
                        fullname, SrcRedirectLoader(redirect_name), origin=spec.origin
                    )
            except (ImportError, ValueError, AttributeError):
                pass
        return None


class SrcRedirectLoader(importlib.abc.Loader):
    """Loader that imports a non-src module and caches it under the src name"""

    def __init__(self, redirect_name):
        self.redirect_name = redirect_name

    def create_module(self, spec):
        # Return the already-loaded or load-on-demand module
        if self.redirect_name in sys.modules:
            return sys.modules[self.redirect_name]
        return None

    def exec_module(self, module):
        # Import and cache the redirect module
        redirect_module = __import__(self.redirect_name, fromlist=["*"])
        sys.modules[module.__name__] = redirect_module


def instalar() -> None:
    """Instala o finder no início de `sys.meta_path` (idempotente)."""
    if not any(isinstance(f, SrcRedirectFinder) for f in sys.meta_path):
        sys.meta_path.insert(0, SrcRedirectFinder())
