/** Base do proxy - reescrita para http://127.0.0.1:8000 pelo proxy.conf.json. */
export const API_BASE = '/api';

/** Todas as rotas do backend. Nenhuma URL de API é montada fora daqui. */
export const API_ROUTES = {
  auth: {
    login: '/auth/jwt/login',
    logout: '/auth/jwt/logout',
    register: '/auth/register',
    forgotPassword: '/auth/forgot-password',
    resetPassword: '/auth/reset-password',
  },
  /**
   * Reenvio do e-mail de ativação. Rota própria do projeto, fora do
   * fastapi-users - por isso fica na raiz e não sob /auth.
   *
   * A ativação em si (`GET /validar_email/{email}/{codigo}`) NÃO aparece aqui:
   * quem a chama é o link do e-mail, direto no backend. O frontend não participa.
   */
  ativacao: {
    reenviarCodigo: (email: string): string => `/reenviar_codigo/${encodeURIComponent(email)}`,
  },
  users: {
    me: '/users/me',
    /** Ainda não existe no backend — respondida pelo mock em desenvolvimento. */
    lista: '/users',
    porId: (id: string): string => `/users/${id}`,
  },
  /**
   * Questionário Plano de Negócios. Uma rota só, três verbos: `GET` lê (e
   * devolve `false` quando ainda não existe), `POST` cria e `PUT` atualiza.
   * O usuário vem do token — não entra na URL nem no corpo.
   */
  questionario: '/questionario',
  /** Anexos do questionário — só o envio existe. O dono vem do token. */
  arquivos: {
    questionario: (aba: number): string => `/arquivos/questionario/${aba}`,
  },
} as const;
