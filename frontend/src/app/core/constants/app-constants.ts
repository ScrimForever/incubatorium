import { Role } from '../models/auth';

/** Rotas internas do app. Nenhuma string de rota é escrita fora daqui. */
export const APP_ROUTES = {
  login: '/login',
  registro: '/registro',
  contaAtivada: '/conta-ativada',
  esqueciSenha: '/esqueci-senha',
  redefinirSenha: '/redefinir-senha',
  minhaConta: '/minha-conta',
  questionario: '/questionario',
  /** Telas de estado do plano: tela cheia, sem menu, como o questionário. */
  aguardandoAprovacao: '/aguardando-aprovacao',
  planoRejeitado: '/plano-rejeitado',
  /** Dentro do painel — só existe para o incubado com o plano aprovado. */
  meuPlano: '/meu-plano',
  /** Lista de planos para quem avalia, e a avaliação de um deles. */
  planosDeNegocio: '/planos-de-negocio',
  /** Sem `encodeURIComponent`: o Router escapa o segmento, e escapar duas vezes
   *  transformava o `@` em `%2540` e o e-mail deixava de bater. */
  planoDe: (email: string): string => `/planos-de-negocio/${email}`,
  usuarios: '/usuarios',
  dashboard: (role: Role): string => `/dashboard/${role}`,
} as const;

/**
 * Por onde cada papel entra no sistema, depois do login e sempre que um guard
 * precisa devolver alguém ao seu lugar.
 *
 * Avaliador e consultor **não têm painel**: o trabalho deles é a lista de
 * planos, em tela cheia, e é nela que caem. Quem tem painel entra por ele.
 * Regra em um lugar só — duas cópias divergiriam na primeira mudança.
 */
export function entradaDe(role: Role): string {
  return role === 'avaliador' ? APP_ROUTES.planosDeNegocio : APP_ROUTES.dashboard(role);
}

/** Rótulos de interface dos papéis. */
export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  avaliador: 'Avaliador',
  colaborador: 'Colaborador',
  incubado: 'Incubado',
};

/** Regra de senha usada no cadastro, na redefinição e na troca. */
export const MIN_PASSWORD_LENGTH = 8;

/** Chave do bearer token no localStorage. */
export const STORAGE_TOKEN_KEY = 'bearerToken';
