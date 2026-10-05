import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { APP_ROUTES, entradaDe } from '../constants/app-constants';
import { Auth } from '../services/auth';

/**
 * Rotas de administração. A API já barra por conta própria (403 para quem não é
 * superusuário); isto evita carregar a tela e levar o erro na cara.
 */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);

  return auth.me().pipe(
    map((user) => (user.role === 'admin' ? true : router.parseUrl(entradaDe(user.role)))),
    catchError(() => of(router.parseUrl(APP_ROUTES.login))),
  );
};
