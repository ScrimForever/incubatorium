import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { APP_ROUTES, entradaDe } from '../constants/app-constants';
import { Auth } from '../services/auth';

/**
 * Planos de negócio: quem avalia e quem administra entram; o incubado, não —
 * ele não tem o que fazer no plano de outra pessoa.
 *
 * Como todo guard daqui, isto é conforto de navegação, não segurança: a trava
 * que vale é a do servidor, e ela ainda não existe (`docs/contrato-avaliacao.md`).
 */
export const avaliadorGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);

  return auth.me().pipe(
    map((user) =>
      user.role === 'avaliador' || user.role === 'admin'
        ? true
        : router.parseUrl(entradaDe(user.role)),
    ),
    catchError(() => of(router.parseUrl(APP_ROUTES.login))),
  );
};
