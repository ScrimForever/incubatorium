import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { UserRead } from '../models/auth';
import { consultorGuard } from './consultor-guard';

describe('consultorGuard', () => {
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

  async function executar(user: UserRead | null, status = 200) {
    const resultado = TestBed.runInInjectionContext(() =>
      consultorGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    const promessa = firstValueFrom(resultado as never);
    http
      .expectOne('/api/users/me')
      .flush(user, status === 200 ? {} : { status, statusText: 'Unauthorized' });
    return promessa;
  }

  it('libera o consultor', async () => {
    expect(await executar({ ...base, is_consultor: true })).toBeTrue();
  });

  it('desvia o administrador para o painel dele', async () => {
    expect(String(await executar({ ...base, is_superuser: true }))).toBe('/dashboard/admin');
  });

  it('desvia o incubado', async () => {
    expect(String(await executar({ ...base, is_incubado: true }))).toBe('/dashboard/incubado');
  });

  it('manda para o login quando o /users/me falha', async () => {
    expect(String(await executar(null, 401))).toBe('/login');
  });
});
