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
        +str usuario_email  «PK»
        +StatusEnum status_questionario
        +dict json_questionario  «JSONB»
        +str decidido_por  «não usado»
        +datetime decidido_em  «não usado»
        +str motivo_decisao  «não usado»
        +datetime ultima_avaliacao_em
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

    User "1" --> "0..1" Questionario : vigente (email)
    Questionario ..> StatusEnum
    User ..> SituacaoIncubacao
```

## 2. Camadas (router → service → repository)

```mermaid
classDiagram
    direction TB

    class UsuariosRouter
    class AvaliacoesRouter
    class ArquivosRouter
    class QuestionarioRouter

    class AvaliacoesService {
        +avaliar(consultor, email, etapa, nota, parecer)
        +listar(solicitante, email)
    }
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
        +enviar_email_nova_avaliacao(...)
    }

    class AvaliacaoRepository {
        +gravar_nota(...)
        +listar_notas(questionario)
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
    AvaliacoesRouter --> AvaliacoesService
    ArquivosRouter --> ArquivosService
    QuestionarioRouter --> QuestionarioService
    QuestionarioService --> QuestionarioRepository
    UsuariosRouter ..> Permissoes
    AvaliacoesRouter ..> Permissoes
    ArquivosRouter ..> Permissoes

    AvaliacoesService --> AvaliacaoRepository
    AvaliacoesService --> UsuariosRepository
    AvaliacoesService --> EmailSetup
    AvaliacoesService ..> Permissoes
    UsuariosService --> UsuariosRepository
    ArquivosService --> ArquivosRepository
    Permissoes --> UsuariosRepository
```
