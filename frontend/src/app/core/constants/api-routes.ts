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
  /**
   * Avaliação de planos. Nenhuma destas três existe no backend ainda — o mock
   * de desenvolvimento responde no shape de `docs/contrato-avaliacao.md`, e são
   * elas que o Scrim precisa publicar para a tela do avaliador viver de verdade.
   */
  avaliacao: {
    planos: '/questionarios',
    planoDe: (email: string): string => `/questionario/${encodeURIComponent(email)}`,
    notaDe: (email: string): string => `/questionario/${encodeURIComponent(email)}/nota`,
    /** Aprovar ou devolver — só a coordenação, e nunca por aqui a nota. */
    statusDe: (email: string): string => `/questionario/${encodeURIComponent(email)}/status`,
  },
  /**
   * Anexos do questionário. O dono vem do token, a aba vai na URL.
   *
   * `download` não entra aqui: a rota exige corpo JSON num `GET`, e navegador
   * não manda corpo em `GET` — medido em 23/09/2026 (`docs/contrato-arquivos.md`).
   */
  arquivos: {
    questionario: (aba: number): string => `/arquivos/questionario/${aba}`,
    nomes: (aba: number): string => `/arquivos/questionario/nome-arquivo/${aba}`,
  },
} as const;
