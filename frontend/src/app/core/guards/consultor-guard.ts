import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { APP_ROUTES, entradaDe } from '../constants/app-constants';
import { Auth } from '../services/auth';

/**
 * Agenda própria de consultoria: só o consultor (papel `avaliador`). O admin
 * passa no backend, mas a agenda é de quem atende — e a coordenação ainda não
 * tem rota para ver as agendas de todos.
 */
export const consultorGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);

  return auth.me().pipe(
    map((user) => (user.role === 'avaliador' ? true : router.parseUrl(entradaDe(user.role)))),
    catchError(() => of(router.parseUrl(APP_ROUTES.login))),
  );
};
