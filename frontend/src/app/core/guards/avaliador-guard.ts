import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { APP_ROUTES, entradaDe } from '../constants/app-constants';
import { Auth } from '../services/auth';

/**
 * Planos de negócio: avaliador e admin entram; o incubado, não. Como todo guard,
 * é conforto de navegação, não segurança — o backend confere o papel na lista
 * (`/questionario/todos`) e na escrita (`PUT /questionario/{id}`).
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
