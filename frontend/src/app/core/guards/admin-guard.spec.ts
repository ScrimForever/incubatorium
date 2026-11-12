import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { UserRead } from '../models/auth';
import { adminGuard } from './admin-guard';

describe('adminGuard', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  const base: UserRead = {
    id: 'u1',
    email: 'quem@teccampos.com',
    is_active: true,
    is_superuser: false,
    is_verified: true,
    is_incubado: false,
    is_admin: false,
    is_consultor: false,
    is_colaborador: false,
  };

  async function executar(user: UserRead) {
    const resultado = TestBed.runInInjectionContext(() =>
      adminGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    const promessa = firstValueFrom(resultado as never);
    http.expectOne('/api/users/me').flush(user);
    return promessa;
  }

  it('libera o admin (is_superuser)', async () => {
    expect(await executar({ ...base, is_superuser: true })).toBeTrue();
  });

  it('libera o admin (is_admin)', async () => {
    expect(await executar({ ...base, is_admin: true })).toBeTrue();
  });

  it('desvia o avaliador para a lista de planos', async () => {
    const resultado = await executar({ ...base, is_consultor: true });
    expect(resultado instanceof UrlTree).toBeTrue();
    expect(String(resultado)).toBe('/planos-de-negocio');
  });

  it('desvia o incubado para o painel dele', async () => {
    const resultado = await executar(base);
    expect(resultado instanceof UrlTree).toBeTrue();
    expect(String(resultado)).toBe('/dashboard/incubado');
  });

  it('desvia o colaborador para o painel dele', async () => {
    const resultado = await executar({ ...base, is_colaborador: true });
    expect(String(resultado)).toBe('/dashboard/colaborador');
  });

  it('manda para o login quando o /users/me falha', async () => {
    const resultado = TestBed.runInInjectionContext(() =>
      adminGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    const promessa = firstValueFrom(resultado as never);
    http.expectOne('/api/users/me').flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(String(await promessa)).toBe('/login');
  });
});
