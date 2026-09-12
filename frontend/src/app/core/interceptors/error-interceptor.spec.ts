import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { TokenStore } from '../auth/token-store';
import { ApiError } from '../models/auth';
import { errorInterceptor } from './error-interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let tokenStore: TokenStore;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    tokenStore = TestBed.inject(TokenStore);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  /** Dispara uma requisição e devolve o ApiError que chegou à página. */
  function capturar(status: number, corpo: object): ApiError {
    let capturado: ApiError | undefined;
    http.get('/api/teste').subscribe({ error: (err: ApiError) => (capturado = err) });
    backend.expectOne('/api/teste').flush(corpo, { status, statusText: 'erro' });
    return capturado as ApiError;
  }

  it('traduz o detail do fastapi-users para mensagem de tela', () => {
    const erro = capturar(400, { detail: 'LOGIN_BAD_CREDENTIALS' });
    expect(erro.code).toBe('LOGIN_BAD_CREDENTIALS');
    expect(erro.message).toBe('E-mail ou senha inválidos.');
  });

  it('lê o detail em forma de objeto { code, reason }', () => {
    const erro = capturar(400, {
      detail: { code: 'RESET_PASSWORD_INVALID_PASSWORD', reason: 'Password too short' },
    });
    expect(erro.code).toBe('RESET_PASSWORD_INVALID_PASSWORD');
    expect(erro.message).toBe('A senha não atende aos requisitos mínimos.');
  });

  it('usa o reason quando o código não tem mensagem própria', () => {
    const erro = capturar(400, { detail: { code: 'ALGO_NOVO', reason: 'Motivo da API' } });
    expect(erro.message).toBe('Motivo da API');
  });

  it('rota inexistente vira NOT_FOUND, não a mensagem genérica', () => {
    // A API responde {"detail":"Not Found"} — um código que não diz nada a quem lê.
    const erro = capturar(404, { detail: 'Not Found' });
    expect(erro.code).toBe('NOT_FOUND');
    expect(erro.message).toBe('Este recurso não existe na API.');
  });

  it('403 das rotas de ativação vira ATIVACAO_RECUSADA', () => {
    // Corpo { "mensagem": ... }, sem `detail`: cairia em UNKNOWN sem o mapeamento.
    const erro = capturar(403, { mensagem: false });
    expect(erro.code).toBe('ATIVACAO_RECUSADA');
  });

  it('marca API fora do ar como OFFLINE', () => {
    expect(capturar(503, {}).code).toBe('OFFLINE');
  });

  it('cai em UNKNOWN quando o detail não é conhecido', () => {
    const erro = capturar(400, { detail: 'ALGO_NOVO' });
    expect(erro.code).toBe('ALGO_NOVO');
    expect(erro.message).toBe('Não foi possível concluir. Tente novamente.');
  });

  it('no 401 encerra a sessão e manda para o login', () => {
    tokenStore.set('token-jwt');
    const navegou = spyOn(router, 'navigate').and.resolveTo(true);

    const erro = capturar(401, {});

    expect(erro.code).toBe('UNAUTHORIZED');
    expect(tokenStore.get()).toBeNull();
    expect(navegou).toHaveBeenCalledWith(['/login']);
  });
});
