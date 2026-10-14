import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, from, map, of, switchMap, throwError } from 'rxjs';
import { TokenStore } from '../auth/token-store';
import { API_ROUTES } from '../constants/api-routes';
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
    catchError((error: unknown) =>
      corpoLegivel(error).pipe(
        switchMap((legivel) => {
          const apiError = normalize(legivel, req.url);
          if (apiError.code === 'UNAUTHORIZED') {
            tokenStore.clear();
            void router.navigate([APP_ROUTES.login]);
          }
          return throwError(() => apiError);
        }),
      ),
    ),
  );
};

/**
 * Em requisição de arquivo (`responseType: 'blob'`), o corpo do erro também
 * chega como `Blob` — e o JSON da recusa (`{"detail":"Sem permissão."}`) fica
 * ilegível. Aqui ele é lido e devolvido como objeto; se não for JSON, o erro
 * segue como veio.
 */
function corpoLegivel(error: unknown): Observable<unknown> {
  if (!(error instanceof HttpErrorResponse) || !(error.error instanceof Blob)) {
    return of(error);
  }
  return from(error.error.text()).pipe(
    map(
      (texto) =>
        new HttpErrorResponse({
          error: JSON.parse(texto) as unknown,
          headers: error.headers,
          status: error.status,
          statusText: error.statusText,
          url: error.url ?? undefined,
        }),
    ),
    catchError(() => of(error)),
  );
}

/** Mensagens para os códigos que o fastapi-users emite. */
const MESSAGES: Record<string, string> = {
  LOGIN_BAD_CREDENTIALS: 'E-mail ou senha inválidos.',
  LOGIN_USER_NOT_VERIFIED: 'Sua conta ainda não foi ativada.',
  REGISTER_USER_ALREADY_EXISTS: 'Este e-mail já está cadastrado.',
  REGISTER_INVALID_PASSWORD: 'A senha não atende aos requisitos mínimos.',
  RESET_PASSWORD_BAD_TOKEN: 'Link de redefinição inválido ou expirado.',
  RESET_PASSWORD_INVALID_PASSWORD: 'A senha não atende aos requisitos mínimos.',
  // Da avaliação de planos — recusas do servidor, não da interface.
  ETAPA_JA_AVALIADA: 'Esta etapa já foi avaliada por outro consultor.',
  AVALIACAO_RESTRITA_CONSULTOR: 'Quem avalia as etapas é o consultor, não a coordenação.',
  DECISAO_RESTRITA_COORDENACAO: 'Só a coordenação pode aprovar ou devolver um plano.',
  ETAPAS_PENDENTES: 'Avalie as nove etapas antes de decidir o plano.',
  JUSTIFICATIVA_OBRIGATORIA: 'Escreva o motivo para devolver o plano.',
};

function normalize(error: unknown, url: string): ApiError {
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
  // A rota de ativação é do projeto, não do fastapi-users: recusa com 403 e
  // corpo { "mensagem": ... }, e só a tela sabe o texto certo. A regra é pela
  // rota, não pelo corpo: plano e anexo alheios também recusam com 403.
  if (error.status === 403 && ehRotaDeAtivacao(url)) {
    return { code: 'ATIVACAO_RECUSADA', message: 'Não foi possível concluir a ativação.' };
  }

  const { code, reason } = lerCorpo(error.error);
  // Rota inexistente responde 404 com {"detail":"Not Found"}, que não diz nada;
  // o 404 de negócio ("Incubado não encontrado.") traz a frase certa.
  if (error.status === 404) {
    const naoEhRotaInexistente = reason !== undefined && reason !== 'Not Found';
    return {
      code: 'NOT_FOUND',
      message: naoEhRotaInexistente ? reason : 'Este recurso não existe na API.',
    };
  }

  const codigo = code ?? CODIGO_POR_STATUS[error.status] ?? 'UNKNOWN';
  return {
    code: codigo,
    message: MESSAGES[codigo] ?? reason ?? 'Não foi possível concluir. Tente novamente.',
  };
}

/** Código para quando a API recusa com frase pronta, sem código próprio. */
const CODIGO_POR_STATUS: Record<number, string> = {
  403: 'FORBIDDEN',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
};

/** `LOGIN_BAD_CREDENTIALS`, `ETAPA_JA_AVALIADA`: maiúsculas e sublinhado, sem espaço. */
const PARECE_CODIGO = /^[A-Z][A-Z0-9_]*$/;

/** `/reenviar_codigo/{email}` — o prefixo sai de `API_ROUTES`, sem e-mail nenhum. */
function ehRotaDeAtivacao(url: string): boolean {
  return url.includes(API_ROUTES.ativacao.reenviarCodigo(''));
}

/**
 * O corpo de erro vem em três dialetos: `detail` string (código do fastapi-users
 * ou frase pronta das rotas do projeto — a forma separa os dois), `detail`
 * objeto `{ code, reason }` (erros de senha) e `{ "mensagem": ... }` (regras de
 * negócio do backend, como o `409` dos anexos com o plano em análise).
 */
function lerCorpo(corpo: unknown): { code?: string; reason?: string } {
  if (!corpo || typeof corpo !== 'object') {
    return {};
  }
  if ('detail' in corpo) {
    const detail = (corpo as { detail: unknown }).detail;
    if (typeof detail === 'string') {
      return PARECE_CODIGO.test(detail) ? { code: detail } : { reason: detail };
    }
    if (detail && typeof detail === 'object' && 'code' in detail) {
      const { code, reason } = detail as { code: unknown; reason?: unknown };
      return {
        code: typeof code === 'string' ? code : undefined,
        reason: typeof reason === 'string' ? reason : undefined,
      };
    }
    return {};
  }
  const mensagem = (corpo as { mensagem?: unknown }).mensagem;
  return typeof mensagem === 'string' ? { reason: mensagem } : {};
}
