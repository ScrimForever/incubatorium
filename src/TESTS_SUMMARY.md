# Resumo de Testes

Suíte atual: **208 testes** (`python -m pytest tests -q -p no:cacheprovider`), todos passando.
Cada pasta de `tests/unit/` espelha uma camada da aplicação.

| Pasta / arquivo | Testes | Cobre |
|---|---|---|
| `auth/test_usuario_manager.py` | 1 | `auth.usuario_manager` |
| `domain/test_models.py`, `test_schemas.py` | 22 | models (`domain/models`) e schemas Pydantic |
| `infra/test_armazenamento.py` | 6 | `infra.armazenamento` (`ArmazenamentoLocal`) |
| `repository/test_usuarios_repository.py`, `test_questionario_repository.py` | 17 | `repository.usuarios`, `repository.questionario` |
| `services/` | 51 | `ativacao_service`, `usuarios_service`, `questionario_service`, `arquivos_service`, `email.setup` |
| `routers/` | 57 | routers de módulo (`usuarios`, `auth`, `questionario`, `arquivos`), perfis e isolamento de dados |
| `shared/` | 16 | `permissoes`, `handlers` |
| `scripts/test_criar_admin.py` | 6 | script `criar_admin` |
| `test_arquitetura.py` | 6 | regras de dependência entre camadas |
| `test_rotas_publicas.py` | 1 | rotas públicas congeladas |
| `test_infra_db.py`, `test_exceptions.py` | 25 | `infra.db`, exceções |

## Executar

```bash
pip install -r requirements-test.txt
python -m pytest tests -q -p no:cacheprovider
python tests/validate_imports.py
ruff check .
```

Com cobertura: `pytest --cov=src --cov-report=html tests/`. Um teste específico:
`pytest tests/unit/repository/test_usuarios_repository.py`.

## Fixtures (`tests/conftest.py`)

- `async_db`: sessão SQLite em memória com todas as tabelas.
- `sample_user_id`, `sample_email`, `sample_password`, `sample_user_data`,
  `sample_questionario_data`: dados de exemplo.
- `criar_usuario(perfil, email=None)`: usuário ativo com um perfil.
- `cliente_api([routers], usuario)`: cliente HTTP autenticado como `usuario`.

## Padrões

- AAA (Arrange-Act-Assert); `@pytest.mark.asyncio` nos testes assíncronos.
- Services recebem repositories/dependências por construtor; testes injetam dobles.
- Routers são testados com `app.dependency_overrides` sobre `routers.dependencias`.
