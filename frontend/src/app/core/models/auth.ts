/** Papéis do sistema. */
export type Role = 'admin' | 'avaliador' | 'colaborador' | 'incubado';

/**
 * Espelha o `UserRead` do backend (fastapi-users). As flags de perfil são
 * `bool | None` e sempre presentes — por isso obrigatórias e anuláveis aqui.
 * Pela regra do backend, uma conta tem exatamente uma verdadeira.
 */
export interface UserRead {
  id: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  is_incubado: boolean | null;
  is_admin: boolean | null;
  is_consultor: boolean | null;
  is_colaborador: boolean | null;
}

/**
 * O usuário da sessão: `UserRead` mais o papel já resolvido a partir das flags
 * (`papelDaConta`, em `core/services/auth.ts`).
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
