import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';

import { TokenStore } from '../auth/token-store';
import { authGuard } from './auth-guard';

describe('authGuard', () => {
  let tokenStore: TokenStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    tokenStore = TestBed.inject(TokenStore);
  });

  afterEach(() => localStorage.clear());

  /** O guard só olha a sessão; rota e estado não influenciam. */
  function executar() {
    return TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
  }

  it('libera a rota quando existe token', () => {
    tokenStore.set('token-jwt');
    expect(executar()).toBeTrue();
  });

  it('manda para o login quando não há token', () => {
    const resultado = executar();
    expect(resultado instanceof UrlTree).toBeTrue();
    expect(String(resultado)).toBe('/login');
  });
});
