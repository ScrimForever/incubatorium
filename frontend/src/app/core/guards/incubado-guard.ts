import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { APP_ROUTES, entradaDe } from '../constants/app-constants';
import { Auth } from '../services/auth';

/**
 * Telas só do incubado (reservar consultoria). O backend recusa quem acumula
 * outro perfil (`agendador_consultoria`); aqui só evita abrir a tela à toa.
 */
export const incubadoGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);

  return auth.me().pipe(
    map((user) => (user.role === 'incubado' ? true : router.parseUrl(entradaDe(user.role)))),
    catchError(() => of(router.parseUrl(APP_ROUTES.login))),
  );
};
