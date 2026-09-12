/** Papéis do sistema. */
export type Role = 'admin' | 'avaliador' | 'colaborador' | 'incubado';

/**
 * Espelha o `UserRead` do backend (fastapi-users, `BaseUser[UUID]`) - exatamente
 * estes campos, nada além. Resposta de /users/me, /auth/register
 * e PATCH /users/me.
 */
export interface UserRead {
  id: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
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
