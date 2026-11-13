import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { Api } from './api';

describe('Api', () => {
  let api: Api;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(Api);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GET monta a URL com a base /api', async () => {
    const promessa = firstValueFrom(api.get<{ ok: boolean }>('/users/me'));
    const req = http.expectOne('/api/users/me');
    expect(req.request.method).toBe('GET');
    req.flush({ ok: true });
    expect(await promessa).toEqual({ ok: true });
  });

  it('POST envia corpo JSON', async () => {
    const promessa = firstValueFrom(api.post('/auth/register', { email: 'a@b.c' }));
    const req = http.expectOne('/api/auth/register');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'a@b.c' });
    req.flush({});
    await promessa;
  });

  it('POST sem corpo envia objeto vazio', async () => {
    const promessa = firstValueFrom(api.post('/auth/jwt/logout'));
    const req = http.expectOne('/api/auth/jwt/logout');
    expect(req.request.body).toEqual({});
    req.flush({});
    await promessa;
  });

  it('PUT envia corpo JSON', async () => {
    const promessa = firstValueFrom(api.put('/questionario', { dados: 1 }));
    const req = http.expectOne('/api/questionario');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ dados: 1 });
    req.flush({});
    await promessa;
  });

  it('PATCH envia corpo JSON', async () => {
    const promessa = firstValueFrom(api.patch('/users/me', { email: 'x@y.z' }));
    const req = http.expectOne('/api/users/me');
    expect(req.request.method).toBe('PATCH');
    req.flush({});
    await promessa;
  });

  it('DELETE simples não tem corpo', async () => {
    const promessa = firstValueFrom(api.delete('/users/123'));
    const req = http.expectOne('/api/users/123');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toBeNull();
    req.flush({});
    await promessa;
  });

  it('deleteComCorpo envia corpo no DELETE', async () => {
    const promessa = firstValueFrom(api.deleteComCorpo('/arquivos/questionario/1', ['a.pdf']));
    const req = http.expectOne('/api/arquivos/questionario/1');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toEqual(['a.pdf']);
    req.flush({});
    await promessa;
  });

  it('postBlob pede responseType blob', async () => {
    const promessa = firstValueFrom(
      api.postBlob('/arquivos/questionario/download/1/0', { nome_arquivo: 'a.pdf' }),
    );
    const req = http.expectOne('/api/arquivos/questionario/download/1/0');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['dados']));
    await promessa;
  });

  it('postForm envia x-www-form-urlencoded', async () => {
    const promessa = firstValueFrom(
      api.postForm('/auth/jwt/login', { username: 'a@b', password: 'x' }),
    );
    const req = http.expectOne('/api/auth/jwt/login');
    expect(req.request.headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
    expect(req.request.body).toContain('username=a%40b');
    expect(req.request.body).toContain('password=x');
    req.flush({ access_token: 'jwt', token_type: 'bearer' });
    await promessa;
  });

  it('postMultipart envia FormData sem forçar Content-Type', async () => {
    const fd = new FormData();
    fd.append('arquivo', new Blob(['x']), 'teste.txt');
    const promessa = firstValueFrom(api.postMultipart('/arquivos/questionario/1', fd));
    const req = http.expectOne('/api/arquivos/questionario/1');
    expect(req.request.body instanceof FormData).toBeTrue();
    req.flush({});
    await promessa;
  });
});
