import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';
import { TokenStore } from '../auth/token-store';
import { API_ROUTES } from '../constants/api-routes';
import { APP_ROUTES } from '../constants/app-constants';
import { Api } from '../http/api';
import { QuestionarioService } from './questionario';
import { AuthToken, Role, SessionUser, UserRead } from '../models/auth';

/**
 * Service de domínio da autenticação. Só orquestra: URLs vêm de api-routes,
 * o token vai pelo auth-interceptor e erros são normalizados no error-interceptor.
 */
@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly api = inject(Api);
  private readonly tokenStore = inject(TokenStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  /** Para esquecer o plano junto com a sessão — ele é do usuário que saiu. */
  private readonly questionario = inject(QuestionarioService);

  /**
   * Quem está logado, guardado para a sessão inteira.
   *
   * Sem isto, um único login rendia **cinco** `GET /users/me`: a tela de login,
   * cada guard da cadeia de redirects e o `ngOnInit` da página de destino
   * perguntavam a mesma coisa. O cache morre com a sessão (`clearSession`,
   * `logout`) e é atualizado pelo `updateMe` — nunca fica valendo por engano.
   */
  private usuario: SessionUser | null = null;
  /** A requisição em voo, para chamadas simultâneas não virarem duas. */
  private meEmVoo: Observable<SessionUser> | null = null;

  login(email: string, password: string): Observable<AuthToken> {
    return this.api.postForm<AuthToken>(API_ROUTES.auth.login, { username: email, password }).pipe(
      tap((token) => {
        // Sessão nova: o que estava guardado era de outra pessoa.
        this.esquecerUsuario();
        this.tokenStore.set(token.access_token);
      }),
    );
  }

  /** GET /users/me - quem está logado, com o papel já resolvido. */
  me(): Observable<SessionUser> {
    if (this.usuario) {
      return of(this.usuario);
    }
    this.meEmVoo ??= this.api.get<UserRead>(API_ROUTES.users.me).pipe(
      map(toSessionUser),
      tap((usuario) => {
        this.usuario = usuario;
        this.meEmVoo = null;
      }),
      catchError((erro: unknown) => {
        this.meEmVoo = null;
        return throwError(() => erro);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.meEmVoo;
  }

  /** Descarta o usuário guardado — trocou a sessão, o cache não vale mais. */
  private esquecerUsuario(): void {
    this.usuario = null;
    this.meEmVoo = null;
    this.questionario.esquecer();
  }

  /**
   * PATCH /users/me. O fastapi-users faz "safe update" aqui: campos
   * privilegiados (is_active, is_superuser, is_verified) mandados pelo cliente
   * são ignorados. Trocar o e-mail zera `is_verified` do lado do servidor.
   */
  updateMe(dados: { email?: string; password?: string }): Observable<SessionUser> {
    const body = {
      ...(dados.email === undefined ? {} : { email: dados.email }),
      ...(dados.password === undefined ? {} : { password: dados.password }),
    };
    return this.api.patch<UserRead>(API_ROUTES.users.me, body).pipe(
      map(toSessionUser),
      tap((usuario) => (this.usuario = usuario)),
    );
  }

  register(email: string, password: string): Observable<UserRead> {
    return this.api.post<UserRead>(API_ROUTES.auth.register, { email, password });
  }

  /**
   * Reenvia o e-mail de ativação: o backend gera um código novo e monta o link.
   * Quem ativa é o link, não o frontend. 200 quando a conta existe, 403 quando não.
   */
  reenviarCodigo(email: string): Observable<void> {
    return this.api
      .post<unknown>(API_ROUTES.ativacao.reenviarCodigo(email))
      .pipe(map(() => undefined));
  }

  /**
   * 202 sem corpo, mesmo para e-mail desconhecido - o backend não revela quem
   * tem conta. A tela responde igual nos dois casos.
   */
  forgotPassword(email: string): Observable<void> {
    return this.api.post<void>(API_ROUTES.auth.forgotPassword, { email });
  }

  resetPassword(token: string, password: string): Observable<void> {
    return this.api.post<void>(API_ROUTES.auth.resetPassword, { token, password });
  }

  /** Há sessão utilizável? Token vencido não conta - e é descartado na hora. */
  isLoggedIn(): boolean {
    if (this.tokenStore.get() === null) {
      return false;
    }
    const expiracao = this.expiresAt();
    if (expiracao && expiracao.getTime() <= Date.now()) {
      this.tokenStore.clear();
      return false;
    }
    return true;
  }

  /** Quando o bearer token expira, lido do `exp` do próprio JWT. */
  expiresAt(): Date | null {
    const payload = this.tokenStore.get()?.split('.')[1];
    if (!payload) {
      return null;
    }
    try {
      const dados = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
        exp?: number;
      };
      return typeof dados.exp === 'number' ? new Date(dados.exp * 1000) : null;
    } catch {
      return null;
    }
  }

  /**
   * Encerra a sessão no servidor e, aconteça o que acontecer, descarta o token
   * local - sair não pode falhar por causa de uma resposta ruim da API.
   */
  logout(): Observable<void> {
    if (this.tokenStore.get() === null) {
      return of(undefined);
    }
    return this.api.post<void>(API_ROUTES.auth.logout).pipe(
      catchError(() => of(undefined)),
      finalize(() => this.clearSession()),
    );
  }

  /**
   * O que todo botão "Sair" faz: encerra a sessão e volta para o login, dê o
   * logout certo ou não.
   */
  sair(): void {
    this.logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ complete: () => void this.router.navigate([APP_ROUTES.login]) });
  }

  /** Descarta só a sessão local, para quando a API já a recusou (401). */
  clearSession(): void {
    this.esquecerUsuario();
    this.tokenStore.clear();
  }
}

/**
 * O papel da sessão, e o único lugar do app que o decide.
 *
 * A ordem importa: administrador primeiro, porque um admin também pode ser
 * consultor e o menu dele é o mais amplo. Os booleanos são lidos quando vêm —
 * hoje só do mock de desenvolvimento, amanhã da API (`docs/contrato-avaliacao.md`);
 * sem eles, sobra o que a API realmente devolve, que é `is_superuser`.
 */
function toSessionUser(user: UserRead): SessionUser {
  const role: Role =
    user.is_superuser || user.is_admin
      ? 'admin'
      : user.is_consultor
        ? 'avaliador'
        : user.is_colaborador
          ? 'colaborador'
          : 'incubado';
  return { ...user, role };
}
