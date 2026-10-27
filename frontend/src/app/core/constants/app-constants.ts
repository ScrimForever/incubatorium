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
  /** Sem `encodeURIComponent`: o Router já escapa o segmento, e escapar duas
   *  vezes quebra o e-mail (`@` vira `%2540`). */
  planoDe: (email: string): string => `/planos-de-negocio/${email}`,
  usuarios: '/usuarios',
  /** Agenda de consultoria do consultor: abrir, editar e cancelar horários. */
  meusHorarios: '/meus-horarios',
  /** O formulário de abrir agenda; publicar volta para Meus horários. */
  abrirAgenda: '/meus-horarios/abrir',
  /** As consultorias marcadas do consultor (horários que um incubado reservou). */
  consultorias: '/consultorias',
  /** Lado do incubado: horários livres para reservar e as reservas dele. */
  agendarConsultoria: '/agendar-consultoria',
  dashboard: (role: Role): string => `/dashboard/${role}`,
} as const;

/**
 * Por onde cada papel entra depois do login e para onde os guards devolvem
 * alguém. O avaliador não tem painel: cai na lista de planos.
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
