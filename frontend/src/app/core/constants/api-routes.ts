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
   * Reenvio do e-mail de ativação: rota do projeto, fora do fastapi-users, por
   * isso na raiz e não sob /auth. A ativação em si (`GET /validar_email/...`)
   * não aparece aqui — o link do e-mail chama o backend direto.
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
   * Avaliação de planos (`docs/contrato-avaliacao.md`). Tudo real: as leituras e
   * uma rota de escrita só, o `PUT` por id, que grava o documento inteiro e o
   * status — nota, ajuste, decisão e correção passam todos por ela.
   */
  avaliacao: {
    /** Todos os planos, com o documento inteiro e o `id` — sem `?status=`: o filtro é da tela. */
    planos: '/questionario/todos',
    /** O plano de outra pessoa, em leitura: consultor, colaborador e coordenação. Sem `id`. */
    planoDe: (email: string): string => `/usuarios/${encodeURIComponent(email)}/plano`,
    /**
     * Grava o plano de outra pessoa (só consultor e coordenação). Corpo de sempre,
     * `{ status_questionario, json_questionario }`, que substitui o documento inteiro.
     */
    porId: (id: number): string => `/questionario/${id}`,
  },
  /**
   * Anexos do questionário. Sem `dono`, o backend usa o e-mail do token; com
   * ele (`?email=`), lê a pasta de outra pessoa — só listar e baixar, e só para
   * consultor e colaborador.
   *
   * `questionario` atende dois métodos: `POST` envia (multipart) e `DELETE`
   * apaga, com a lista de nomes no corpo.
   */
  arquivos: {
    questionario: (aba: number): string => `/arquivos/questionario/${aba}`,
    nomes: (aba: number, dono?: string): string =>
      `/arquivos/questionario/nome-arquivo/${aba}${doDono(dono)}`,
    /**
     * O `0` é o path param `todos`, obrigatório na rota e sem efeito no
     * backend: baixar tudo de uma vez não existe.
     */
    download: (aba: number, dono?: string): string =>
      `/arquivos/questionario/download/${aba}/0${doDono(dono)}`,
  },
  /**
   * Agenda de consultoria (`docs/plano-consultorias.md`). O consultor abre janelas
   * (data + faixa) que o backend fatia em horários; o incubado reserva um horário.
   * Sem aceite nem status: reservado é marcado, cancelado some.
   */
  consultorias: {
    /** `POST` abre janelas em várias datas de uma vez. */
    agenda: '/consultorias/agenda',
    /** As janelas do consultor logado, de hoje em diante, com quem reservou. */
    minhaAgenda: '/consultorias/agenda/minha',
    /** `PATCH` muda faixa ou duração (refatia os livres, com ids novos); `DELETE` cancela. */
    janela: (id: number): string => `/consultorias/janelas/${id}`,
    /** Cancela todas as janelas do consultor nas datas do corpo. */
    cancelarDias: '/consultorias/janelas/cancelar',
    /** `PATCH` remarca um horário dentro da janela; `DELETE` tira (hoje responde 500). */
    horario: (id: number): string => `/consultorias/horarios/${id}`,
    /** Horários livres e futuros — só incubado. */
    livres: '/consultorias/horarios',
    /** As reservas futuras do incubado logado. */
    minhas: '/consultorias/minhas',
    reservar: (id: number): string => `/consultorias/horarios/${id}/reservar`,
    /** Cancela a reserva do incubado (hoje responde 500). */
    reserva: (id: number): string => `/consultorias/horarios/${id}/reserva`,
  },
} as const;

/** `?email=` dos anexos de outra pessoa; vazio quando o dono é quem está logado. */
function doDono(dono?: string): string {
  return dono ? `?email=${encodeURIComponent(dono)}` : '';
}
