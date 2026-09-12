import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Observable, isObservable } from 'rxjs';

import { TokenStore } from '../auth/token-store';
import { guestGuard } from './guest-guard';

describe('guestGuard', () => {
  let tokenStore: TokenStore;
  let backend: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    tokenStore = TestBed.inject(TokenStore);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  function executar() {
    const rota = {} as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(() => guestGuard(rota, {} as RouterStateSnapshot));
  }

  function jwtValido(): string {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    return `cabecalho.${btoa(JSON.stringify({ exp }))}.assinatura`;
  }

  it('deixa passar quem não tem sessão', () => {
    expect(executar()).toBeTrue();
  });

  it('manda quem já está logado para o painel do seu role', (done) => {
    tokenStore.set(jwtValido());
    const resultado = executar() as Observable<boolean | UrlTree>;
    expect(isObservable(resultado)).toBeTrue();

    resultado.subscribe((valor) => {
      expect(valor instanceof UrlTree).toBeTrue();
      expect(String(valor)).toBe('/dashboard/admin');
      done();
    });

    backend.expectOne('/api/users/me').flush({
      id: 'abc',
      email: 'admin@teccampos.com',
      is_active: true,
      is_superuser: true,
      is_verified: true,
    });
  });

  it('libera a tela quando o token não serve mais', (done) => {
    tokenStore.set(jwtValido());
    const resultado = executar() as Observable<boolean | UrlTree>;

    resultado.subscribe((valor) => {
      expect(valor).toBeTrue();
      done();
    });

    backend.expectOne('/api/users/me').flush({}, { status: 401, statusText: 'Unauthorized' });
  });
});
