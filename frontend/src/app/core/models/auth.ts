/** Papéis do sistema. */
export type Role = 'admin' | 'avaliador' | 'colaborador' | 'incubado';

/**
 * Espelha o `UserRead` do backend (fastapi-users, `BaseUser[UUID]`). Os cinco
 * primeiros campos são o que a API devolve hoje.
 *
 * Os opcionais são o contrato pedido em `docs/contrato-avaliacao.md`: as colunas
 * já existem em `src/infra/db.py` e só falta o backend expô-las. Enquanto isso,
 * quem as preenche é o mock de desenvolvimento — por isso são opcionais e não
 * obrigatórios: em produção elas simplesmente não vêm, e o papel continua sendo
 * derivado do `is_superuser`.
 */
export interface UserRead {
  id: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  is_admin?: boolean;
  is_consultor?: boolean;
  is_incubado?: boolean;
  is_colaborador?: boolean;
  /** Área de atuação do avaliador, que assina a nota dele. */
  especialidade?: string;
  /**
   * Nome de quem está logado. **A API não devolve** — o `User` do backend só
   * tem e-mail (divergência em `docs/contrato-avaliacao.md`); hoje só o mock
   * preenche, para a assinatura da nota mostrar nome além do e-mail.
   */
  nome?: string;
}

/**
 * O usuário da sessão: `UserRead` mais o papel já resolvido. A API ainda não
 * devolve `role`, então o Auth deriva o valor (ver `toSessionUser`); quando o
 * campo existir no backend, é só passar a ler dele.
 */
export interface SessionUser extends UserRead {
  role: Role;
}

/** Resposta de POST /auth/jwt/login. */
export interface AuthToken {
  access_token: string;
  token_type: string;
}

/** Todo erro HTTP chega às páginas neste formato (error-interceptor). */
export interface ApiError {
  code: string;
  message: string;
}
