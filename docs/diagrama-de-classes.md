# Diagrama de classes — Gestão de Incubação

Renderiza no GitHub/GitLab e no VS Code (extensão Mermaid). Reflete o código em `src/`.

## 1. Domínio (models persistidos e estruturas do JSON)

```mermaid
classDiagram
    direction LR

    class User {
        <<fastapi-users>>
        +UUID id
        +str email  «único»
        +str hashed_password
        +bool is_active
        +bool is_admin
        +bool is_colaborador
        +bool is_consultor
        +bool is_incubado
        +str codigo_ativacao
        +SituacaoIncubacao situacao_incubacao
        +datetime situacao_alterada_em
        +str situacao_alterada_por
    }

    class Questionario {
        <<plano de negócio>>
        +int id  «PK, autoincremento»
        +str usuario_email  «e-mail do usuário, não único»
        +StatusEnum status_questionario
        +dict json_questionario  «JSONB»
        +str decidido_por  «não usado»
        +datetime decidido_em  «não usado»
        +str motivo_decisao  «não usado»
        +str criado_por
        +datetime criado_em
        +str atualizado_por
        +datetime atualizado_em
    }

    class StatusEnum {
        <<enumeration>>
        iniciado
        pendente
        aguardando_aprovacao
        aprovado
        rejeitado
    }

    class SituacaoIncubacao {
        <<enumeration>>
        ativo
        concluido
        desistente
    }

    User "1" --> "0..*" Questionario : usuario_email (sem FK)
    Questionario ..> StatusEnum
    User ..> SituacaoIncubacao
```

## 2. Camadas (router → service → repository)

```mermaid
classDiagram
    direction TB

    class UsuariosRouter
    class ArquivosRouter
    class QuestionarioRouter

    class UsuariosService {
        +plano(email)
        +painel(situacao)
        +alterar_situacao(...)
    }
    class QuestionarioService {
        +buscar()
        +criar(entrada)
        +atualizar(entrada)
    }
    class ArquivosService {
        +verificar_edicao(email)
    }
    class EmailSetup {
        +enviar_email_cadastro(email)
    }

    class UsuariosRepository {
        +buscar_plano(email)
        +painel_incubados(situacao)
        +alterar_situacao(...)
    }
    class ArquivosRepository {
        +buscar(email)
    }
    class QuestionarioRepository {
        +buscar_questionario(...)
        +gravar_questionario(...)
        +atualizar_questionario(...)
        +buscar_para_atualizar()
        +salvar()
        +inicializar_questionario(email)
    }

    class Permissoes {
        <<shared>>
        +exigir_colaborador()
        +exigir_consultor()
        +exigir_acesso_incubado(email)
        +pode_acessar_incubado(db, user, email)
    }
    UsuariosRouter --> UsuariosService
    ArquivosRouter --> ArquivosService
    QuestionarioRouter --> QuestionarioService
    QuestionarioService --> QuestionarioRepository
    UsuariosRouter ..> Permissoes
    ArquivosRouter ..> Permissoes

    UsuariosService --> UsuariosRepository
    ArquivosService --> ArquivosRepository
    Permissoes --> UsuariosRepository
```
