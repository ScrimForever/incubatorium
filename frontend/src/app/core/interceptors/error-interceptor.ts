import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { TokenStore } from '../auth/token-store';
import { APP_ROUTES } from '../constants/app-constants';
import { ApiError } from '../models/auth';

/**
 * Converte toda falha HTTP em ApiError { code, message } e, quando a API recusa
 * a sessão (401), encerra ela aqui - uma vez, no caminho por onde toda resposta
 * passa. As páginas nunca leem HttpErrorResponse nem tratam sessão expirada.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenStore = inject(TokenStore);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: unknown) => {
      const apiError = normalize(error);
      if (apiError.code === 'UNAUTHORIZED') {
        tokenStore.clear();
        void router.navigate([APP_ROUTES.login]);
      }
      return throwError(() => apiError);
    }),
  );
};

/** Mensagens para os códigos que o fastapi-users emite. */
const MESSAGES: Record<string, string> = {
  LOGIN_BAD_CREDENTIALS: 'E-mail ou senha inválidos.',
  LOGIN_USER_NOT_VERIFIED: 'Sua conta ainda não foi ativada.',
  REGISTER_USER_ALREADY_EXISTS: 'Este e-mail já está cadastrado.',
  REGISTER_INVALID_PASSWORD: 'A senha não atende aos requisitos mínimos.',
  RESET_PASSWORD_BAD_TOKEN: 'Link de redefinição inválido ou expirado.',
  RESET_PASSWORD_INVALID_PASSWORD: 'A senha não atende aos requisitos mínimos.',
};

function normalize(error: unknown): ApiError {
  if (!(error instanceof HttpErrorResponse)) {
    return { code: 'UNKNOWN', message: 'Ocorreu um erro inesperado. Tente novamente.' };
  }
  if (error.status === 0 || error.status >= 502) {
    return {
      code: 'OFFLINE',
      message: 'A API não está disponível no momento. Por favor, tente mais tarde.',
    };
  }
  if (error.status === 401) {
    return { code: 'UNAUTHORIZED', message: 'Sessão expirada. Faça login novamente.' };
  }
  // As rotas de ativação por código são do projeto, não do fastapi-users:
  // recusam com 403 e corpo { "mensagem": ... }, sem `detail` nem código. Cada
  // tela dá o texto certo, porque só ela sabe se pediu validação ou reenvio.
  if (error.status === 403) {
    return { code: 'ATIVACAO_RECUSADA', message: 'Não foi possível concluir a ativação.' };
  }
  // A API responde 404 com {"detail":"Not Found"} quando a rota não existe —
  // um código que não diz nada. Vale distinguir de um erro de negócio.
  if (error.status === 404) {
    return { code: 'NOT_FOUND', message: 'Este recurso não existe na API.' };
  }

  const { code, reason } = lerDetail(error.error);
  return {
    code,
    message: MESSAGES[code] ?? reason ?? 'Não foi possível concluir. Tente novamente.',
  };
}

/**
 * O `detail` do fastapi-users vem em duas formas: string com o código
 * ("LOGIN_BAD_CREDENTIALS") ou objeto { code, reason } nos erros de senha.
 */
function lerDetail(corpo: unknown): { code: string; reason?: string } {
  if (!corpo || typeof corpo !== 'object' || !('detail' in corpo)) {
    return { code: 'UNKNOWN' };
  }
  const detail = (corpo as { detail: unknown }).detail;
  if (typeof detail === 'string') {
    return { code: detail };
  }
  if (detail && typeof detail === 'object' && 'code' in detail) {
    const { code, reason } = detail as { code: unknown; reason?: unknown };
    return {
      code: typeof code === 'string' ? code : 'UNKNOWN',
      reason: typeof reason === 'string' ? reason : undefined,
    };
  }
  return { code: 'UNKNOWN' };
}
