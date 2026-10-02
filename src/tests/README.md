# Testes do Sistema

Estrutura de testes unitários e de integração para o projeto.

## Estrutura de Diretórios

```
tests/
├── conftest.py              # Fixtures compartilhadas
├── pytest.ini              # Configuração do pytest
├── README.md               # Este arquivo
└── unit/
    ├── domain/
    │   ├── test_models.py
    │   └── test_schemas.py
    ├── repository/          # user, questionario, ingresso, avaliacao
    ├── services/            # user, ingresso, avaliacoes, usuarios
    ├── routers/             # questionario, ingresso, usuarios, avaliacoes, arquivos
    │   └── test_isolamento_dados.py   # toda rota exige login; ninguém lê dados alheios
    ├── shared/              # permissoes, handlers
    ├── scripts/             # criar_admin
    └── test_infra_db.py
```

## Requisitos

```bash
pip install pytest pytest-asyncio pytest-cov
```

## Executar Testes

### Todos os testes
```bash
pytest
```

### Apenas testes unitários
```bash
pytest tests/unit
```

### Testes de um módulo específico
```bash
pytest tests/unit/repository/test_user_repository.py
```

### Com cobertura
```bash
pytest --cov=src tests/
```

### Verbose
```bash
pytest -v tests/
```

## Estrutura de um Teste

```python
import pytest


class TestMinhaClasse:
    @pytest.mark.asyncio
    async def test_funcionalidade(self, async_db):
        """Descrição do teste"""
        # Arrange
        dados = {"campo": "valor"}

        # Act
        resultado = await minha_funcao(dados)

        # Assert
        assert resultado.campo == "valor"
```

## Fixtures Disponíveis

- `async_db`: Banco de dados em memória para testes
- `sample_user_id`: UUID de exemplo
- `sample_email`: Email de exemplo
- `sample_password`: Senha de exemplo
- `sample_user_data`: Dados de usuário completos
- `sample_questionario_data`: Dados de questionário completos

## Melhores Práticas

1. **Nomenclatura**: `test_<funcionalidade>_<condicao>`
2. **AAA Pattern**: Arrange, Act, Assert
3. **Async/Await**: Use `@pytest.mark.asyncio` para testes assíncronos
4. **Isolamento**: Cada teste deve ser independente
5. **Fixtures**: Use fixtures para dados compartilhados
6. **Mocks**: Use `unittest.mock` para mockar dependências
7. **Parametrização**: Use `@pytest.mark.parametrize` para múltiplos casos

## Cobertura de Testes

Objetivo: Manter cobertura acima de 80%

```bash
pytest --cov=src --cov-report=html tests/
```

Relatório HTML será gerado em `htmlcov/index.html`


## Fixtures úteis (`conftest.py`)

- `async_db`: sessão SQLite em memória com todas as tabelas.
- `criar_usuario(perfil, email=None)`: usuário ativo com exatamente um perfil
  (`admin`, `colaborador`, `consultor` ou `incubado`).
- `cliente_api([routers], usuario)`: cliente HTTP assíncrono já autenticado como `usuario`.

## Migrações

As tabelas dos testes vêm de `Base.metadata.create_all`. O esquema real é versionado em
`src/migrations/` (Alembic); depois de alterar um model, gere a migração e confira com
`ALEMBIC_FORCE_LOCAL=1 uv run alembic check`.
