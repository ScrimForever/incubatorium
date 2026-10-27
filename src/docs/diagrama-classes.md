# Diagrama de classes macro — Incubatorium


```mermaid
classDiagram
direction LR

%% ===== DOMÍNIO =====
class Base
class MixinDate {
  criado_por
  criado_em
  atualizado_em
  atualizado_por
}
class User {
  UUID id
  email
  is_admin
  is_consultor
  is_colaborador
  is_incubado
  codigo_ativacao
  situacao_incubacao
}
class Questionario {
  id
  usuario_email
  status_questionario
  json_questionario
  decidido_por / decidido_em
}
class QuestionarioHistorico {
  questionario_id FK
  json_questionario
  status_questionario
}
class ConsultoriaJanela {
  consultor_email
  data
  hora_inicio / hora_fim
  duracao_minutos
}
class ConsultoriaHorario {
  janela_id FK
  consultor_email
  inicio / fim
  incubado_email
  reservado_em
}
class SituacaoIncubacao { <<enum>> ativo / concluido / desistente }
class StatusEnum { <<enum>> iniciado / pendente / aguardando_aprovacao / aprovado / rejeitado }

Base <|-- User
Base <|-- Questionario
Base <|-- QuestionarioHistorico
Base <|-- ConsultoriaJanela
Base <|-- ConsultoriaHorario
MixinDate <|-- Questionario
MixinDate <|-- ConsultoriaJanela
Questionario "1" *-- "N" QuestionarioHistorico
ConsultoriaJanela "1" *-- "N" ConsultoriaHorario
User "1" .. "0..1" Questionario : usuario_email (lógica)
User "1" .. "N" ConsultoriaJanela : consultor_email (lógica)
User "0..1" .. "N" ConsultoriaHorario : incubado_email (lógica)
User --> SituacaoIncubacao
Questionario --> StatusEnum

%% ===== REPOSITORY =====
class Repositorio { db AsyncSession; salvar() }
class UsuariosRepository
class QuestionarioRepository
class ConsultoriaRepository
Repositorio <|-- UsuariosRepository
Repositorio <|-- QuestionarioRepository
Repositorio <|-- ConsultoriaRepository
UsuariosRepository ..> User
QuestionarioRepository ..> Questionario
QuestionarioRepository ..> QuestionarioHistorico
ConsultoriaRepository ..> ConsultoriaJanela
ConsultoriaRepository ..> ConsultoriaHorario

%% ===== SERVICES =====
class UsuariosService { plano() painel() alterar_situacao() }
class AtivacaoService { ativar() reenviar_codigo() }
class QuestionarioService { buscar() criar() atualizar() atualizar_por_id() }
class ArquivosService { receber() listar() caminho_download() apagar() }
class ConsultoriaService { abrir_agenda() editar/cancelar janela e horário() listar_livres() reservar() cancelar_reserva() }
class EmailSetup { enviar_email_cadastro() enviar_notificacao() }
class ArmazenamentoLocal { gravar() listar() apagar() arquivar() }
class UserManager { on_after_register() on_after_forgot_password() }

UsuariosService --> UsuariosRepository
UsuariosService --> QuestionarioRepository
AtivacaoService --> UsuariosRepository
AtivacaoService --> QuestionarioRepository
AtivacaoService --> EmailSetup
QuestionarioService --> QuestionarioRepository
ArquivosService --> QuestionarioRepository
ArquivosService --> ArmazenamentoLocal
ConsultoriaService --> ConsultoriaRepository
ConsultoriaService --> UsuariosRepository
ConsultoriaService --> EmailSetup
UserManager --> EmailSetup
EmailSetup ..> UsuariosRepository

%% ===== ROUTERS =====
class auth_router
class usuarios_router
class questionario_router
class arquivos_router
class consultoria_router
auth_router --> AtivacaoService
auth_router --> UserManager
usuarios_router --> UsuariosService
questionario_router --> QuestionarioService
arquivos_router --> ArquivosService
consultoria_router --> ConsultoriaService

%% ===== PERMISSÕES =====
class permissoes {
  exigir_perfil()
  exigir_apenas()
  pode_acessar_incubado()
}
usuarios_router ..> permissoes : gestor_incubados
questionario_router ..> permissoes : editor / avaliador
arquivos_router ..> permissoes : enviador / visualizador
consultoria_router ..> permissoes : gestor_agenda / agendador
permissoes ..> User : lê flags de perfil
```

## Notas de leitura
- Relações pontilhadas `..` entre `User` e demais entidades são **lógicas por e-mail, sem FK**.
- "Sessão" e "Calendário" não existem como módulos de domínio: sessão = `AsyncSession`/JWT; calendário = módulo `consultoria` + `shared/datas.py`.
- Fora do diagrama (transversais): `shared/exceptions` (`NegocioError` e subclasses), `shared/handlers`, `infra/config|db`, `auth/backend`.
- Atribuição de `is_admin/is_consultor/is_colaborador` não tem rota; não verificado se é via script/banco.
