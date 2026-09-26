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
import { avaliadorGuard } from './avaliador-guard';

describe('avaliadorGuard', () => {
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
  };

  /** Executa o guard e responde o /users/me com o usuário dado. */
  async function executar(user: UserRead) {
    const resultado = TestBed.runInInjectionContext(() =>
      avaliadorGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    const promessa = firstValueFrom(resultado as never);
    http.expectOne('/api/users/me').flush(user);
    return promessa;
  }

  it('libera o avaliador', async () => {
    expect(await executar({ ...base, is_consultor: true })).toBeTrue();
  });

  it('libera o administrador, que também avalia', async () => {
    expect(await executar({ ...base, is_superuser: true })).toBeTrue();
  });

  it('desvia o incubado para o painel dele', async () => {
    const resultado = await executar(base);
    expect(resultado instanceof UrlTree).toBeTrue();
    expect(String(resultado)).toBe('/dashboard/incubado');
  });

  it('desvia o colaborador, que não avalia plano', async () => {
    const resultado = await executar({ ...base, is_colaborador: true });
    expect(String(resultado)).toBe('/dashboard/colaborador');
  });

  it('manda para o login quando o /users/me falha', async () => {
    const resultado = TestBed.runInInjectionContext(() =>
      avaliadorGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    const promessa = firstValueFrom(resultado as never);
    http.expectOne('/api/users/me').flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(String(await promessa)).toBe('/login');
  });
});
