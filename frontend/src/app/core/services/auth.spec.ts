import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TokenStore } from '../auth/token-store';
import { UserRead, SessionUser } from '../models/auth';
import { Auth } from './auth';

const USUARIO: UserRead = {
  id: '3f8c1e6a-0000-0000-0000-000000000000',
  email: 'usuario@teccampos.com',
  is_active: true,
  is_superuser: false,
  is_verified: true,
};

/** JWT de mentira: só o payload importa, e só o campo exp dentro dele. */
function jwtQueExpiraEm(exp: number): string {
  return `cabecalho.${btoa(JSON.stringify({ exp }))}.assinatura`;
}

describe('Auth', () => {
  let auth: Auth;
  let tokenStore: TokenStore;
  let backend: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(Auth);
    tokenStore = TestBed.inject(TokenStore);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  it('envia o login como form-urlencoded e guarda o token', () => {
    auth.login('usuario@teccampos.com', '12345678').subscribe();

    const req = backend.expectOne('/api/auth/jwt/login');
    expect(req.request.body).toBe('username=usuario%40teccampos.com&password=12345678');
    expect(req.request.headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');

    req.flush({ access_token: 'token-jwt', token_type: 'bearer' });
    expect(tokenStore.get()).toBe('token-jwt');
  });

  it('pede o reenvio do e-mail de ativação por POST', () => {
    auth.reenviarCodigo('usuario@teccampos.com').subscribe();

    const req = backend.expectOne('/api/reenviar_codigo/usuario%40teccampos.com');
    expect(req.request.method).toBe('POST');
    req.flush({ mensagem: 'Email enviado com sucesso.' });
  });

  it('deriva o papel incubado para usuário comum', () => {
    let sessao: SessionUser | undefined;
    auth.me().subscribe((user) => (sessao = user));
    backend.expectOne('/api/users/me').flush(USUARIO);

    expect(sessao?.role).toBe('incubado');
    expect(sessao?.email).toBe('usuario@teccampos.com');
  });

  it('deriva o papel admin de is_superuser', () => {
    let sessao: SessionUser | undefined;
    auth.me().subscribe((user) => (sessao = user));
    backend.expectOne('/api/users/me').flush({ ...USUARIO, is_superuser: true });

    expect(sessao?.role).toBe('admin');
  });

  it('manda só os campos informados no PATCH da conta', () => {
    auth.updateMe({ password: 'senhanova123' }).subscribe();

    const req = backend.expectOne('/api/users/me');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ password: 'senhanova123' });
    req.flush(USUARIO);
  });

  it('lê a expiração do exp do próprio JWT', () => {
    tokenStore.set(jwtQueExpiraEm(1700000000));

    expect(auth.expiresAt()?.getTime()).toBe(1700000000 * 1000);
  });

  it('devolve null quando o token não é um JWT legível', () => {
    tokenStore.set('token-opaco');
    expect(auth.expiresAt()).toBeNull();
  });

  it('recusa e descarta token já expirado', () => {
    tokenStore.set(jwtQueExpiraEm(Math.floor(Date.now() / 1000) - 60));

    expect(auth.isLoggedIn()).toBeFalse();
    expect(tokenStore.get()).toBeNull();
  });

  it('aceita token dentro da validade', () => {
    tokenStore.set(jwtQueExpiraEm(Math.floor(Date.now() / 1000) + 3600));

    expect(auth.isLoggedIn()).toBeTrue();
    expect(tokenStore.get()).not.toBeNull();
  });

  it('logout avisa a API e limpa o token', () => {
    tokenStore.set('token-jwt');

    auth.logout().subscribe();
    backend
      .expectOne('/api/auth/jwt/logout')
      .flush(null, { status: 204, statusText: 'No Content' });

    expect(auth.isLoggedIn()).toBeFalse();
  });

  it('logout limpa o token mesmo se a API falhar', () => {
    tokenStore.set('token-jwt');

    auth.logout().subscribe();
    backend
      .expectOne('/api/auth/jwt/logout')
      .flush({}, { status: 500, statusText: 'Server Error' });

    expect(auth.isLoggedIn()).toBeFalse();
  });

  it('logout sem sessão não chama a API', () => {
    let completou = false;
    auth.logout().subscribe({ complete: () => (completou = true) });

    backend.expectNone('/api/auth/jwt/logout');
    expect(completou).toBeTrue();
  });

  it('pede a redefinição de senha', () => {
    auth.forgotPassword('usuario@teccampos.com').subscribe();

    const req = backend.expectOne('/api/auth/forgot-password');
    expect(req.request.body).toEqual({ email: 'usuario@teccampos.com' });
    req.flush(null, { status: 202, statusText: 'Accepted' });
  });

  it('envia token e nova senha na redefinição', () => {
    auth.resetPassword('token-reset', 'novasenha1').subscribe();

    const req = backend.expectOne('/api/auth/reset-password');
    expect(req.request.body).toEqual({ token: 'token-reset', password: 'novasenha1' });
    req.flush(null);
  });

  describe('cache de quem está logado', () => {
    it('pergunta /users/me uma vez só e reaproveita', () => {
      auth.me().subscribe();
      backend.expectOne('/api/users/me').flush(USUARIO);

      let segundo: SessionUser | undefined;
      auth.me().subscribe((u) => (segundo = u));
      backend.expectNone('/api/users/me');
      expect(segundo?.email).toBe(USUARIO.email);
    });

    it('chamadas simultâneas viram uma requisição só', () => {
      auth.me().subscribe();
      auth.me().subscribe();
      auth.me().subscribe();

      backend.expectOne('/api/users/me').flush(USUARIO);
      backend.verify();
    });

    it('sair da sessão descarta o usuário guardado', () => {
      auth.me().subscribe();
      backend.expectOne('/api/users/me').flush(USUARIO);

      auth.clearSession();

      auth.me().subscribe();
      backend.expectOne('/api/users/me').flush(USUARIO);
    });

    it('entrar com outra conta não herda o usuário anterior', () => {
      auth.me().subscribe();
      backend.expectOne('/api/users/me').flush(USUARIO);

      auth.login('outro@teccampos.com', 'senha12345').subscribe();
      backend.expectOne('/api/auth/jwt/login').flush({ access_token: 'x', token_type: 'bearer' });

      auth.me().subscribe();
      backend.expectOne('/api/users/me').flush({ ...USUARIO, email: 'outro@teccampos.com' });
    });

    it('erro não fica guardado: a próxima chamada tenta de novo', () => {
      auth.me().subscribe({ error: () => undefined });
      backend.expectOne('/api/users/me').flush('falhou', { status: 500, statusText: 'Erro' });

      auth.me().subscribe({ error: () => undefined });
      backend.expectOne('/api/users/me').flush('falhou', { status: 500, statusText: 'Erro' });
    });
  });
});
