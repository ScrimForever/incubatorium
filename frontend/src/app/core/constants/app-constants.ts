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
  usuarios: '/usuarios',
  dashboard: (role: Role): string => `/dashboard/${role}`,
} as const;

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
