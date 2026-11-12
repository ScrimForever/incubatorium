import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { TokenStore } from '../auth/token-store';
import { authInterceptor } from './auth-interceptor';

describe('authInterceptor', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  let tokenStore: TokenStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    tokenStore = TestBed.inject(TokenStore);
  });

  afterEach(() => http.verify());

  it('injeta o bearer token quando há sessão', async () => {
    spyOn(tokenStore, 'get').and.returnValue('meu-jwt');
    const promessa = firstValueFrom(client.get('/api/users/me'));
    const req = http.expectOne('/api/users/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer meu-jwt');
    req.flush({});
    await promessa;
  });

  it('não injeta header quando não há token', async () => {
    spyOn(tokenStore, 'get').and.returnValue(null);
    const promessa = firstValueFrom(client.get('/api/auth/register'));
    const req = http.expectOne('/api/auth/register');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
    await promessa;
  });
});
