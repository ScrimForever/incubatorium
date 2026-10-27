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
  function capturar(status: number, corpo: object, url = '/api/teste'): ApiError {
    let capturado: ApiError | undefined;
    http.get(url).subscribe({ error: (err: ApiError) => (capturado = err) });
    backend.expectOne(url).flush(corpo, { status, statusText: 'erro' });
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

  it('403 da rota de ativação vira ATIVACAO_RECUSADA', () => {
    // Corpo { "mensagem": ... }, sem `detail`: cairia em UNKNOWN sem o mapeamento.
    const erro = capturar(403, { mensagem: false }, '/api/reenviar_codigo/ana%40teccampos.com');
    expect(erro.code).toBe('ATIVACAO_RECUSADA');
  });

  it('403 sem detail fora da ativação não vira erro de ativação', () => {
    const erro = capturar(403, {});
    expect(erro.code).toBe('FORBIDDEN');
  });

  it('lê a recusa em JSON mesmo quando a requisição pedia arquivo (blob)', async () => {
    // O download de anexo pede `blob`, e o corpo do erro chega como Blob também.
    const resultado = new Promise<ApiError>((resolve) =>
      http.get('/api/arquivo', { responseType: 'blob' }).subscribe({ error: resolve }),
    );
    const corpo = new Blob([JSON.stringify({ detail: 'Sem permissão.' })], {
      type: 'application/json',
    });
    backend.expectOne('/api/arquivo').flush(corpo, { status: 403, statusText: 'Forbidden' });

    const erro = await resultado;
    expect(erro.code).toBe('FORBIDDEN');
    expect(erro.message).toBe('Sem permissão.');
  });

  it('403 com código no detail mantém o código, em vez de virar ativação', () => {
    const erro = capturar(403, { detail: 'LOGIN_USER_NOT_VERIFIED' });
    expect(erro.code).toBe('LOGIN_USER_NOT_VERIFIED');
    expect(erro.message).toBe('Sua conta ainda não foi ativada.');
  });

  it('detail em frase (rotas do projeto) vira a mensagem, não um código', () => {
    const erro = capturar(403, { detail: 'Sem permissão para esta operação.' });
    expect(erro.code).toBe('FORBIDDEN');
    expect(erro.message).toBe('Sem permissão para esta operação.');
  });

  it('422 do anexo recusado mostra o motivo que a API deu', () => {
    const motivo = "Arquivo 'teste.exe' recusado: tipo não permitido (aceitos: .pdf, .png)";
    const erro = capturar(422, { detail: motivo });
    expect(erro.code).toBe('UNPROCESSABLE');
    expect(erro.message).toBe(motivo);
  });

  it('422 do schema (detail em lista) mostra a frase da regra do projeto', () => {
    const erro = capturar(422, {
      detail: [{ type: 'value_error', loc: ['body'], msg: 'Value error, Há datas repetidas.' }],
    });
    expect(erro.code).toBe('UNPROCESSABLE');
    expect(erro.message).toBe('Há datas repetidas.');
  });

  it('422 do schema com regra do Pydantic (em inglês) vira aviso genérico', () => {
    const erro = capturar(422, {
      detail: [{ type: 'greater_than', msg: 'Input should be greater than 0' }],
    });
    expect(erro.message).toContain('recusou um dos valores');
  });

  it('lê o { mensagem } das recusas de negócio do backend', () => {
    const erro = capturar(409, { mensagem: 'Não é possível alterar anexos no estado atual.' });
    expect(erro.code).toBe('CONFLICT');
    expect(erro.message).toBe('Não é possível alterar anexos no estado atual.');
  });

  it('404 de negócio traz a frase da API; rota inexistente segue genérica', () => {
    const erro = capturar(404, { detail: 'Incubado não encontrado.' });
    expect(erro.code).toBe('NOT_FOUND');
    expect(erro.message).toBe('Incubado não encontrado.');
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
