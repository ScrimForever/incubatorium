import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { entradaDe } from '../constants/app-constants';
import { Auth } from '../services/auth';

/**
 * O oposto do authGuard: quem já está autenticado vai direto para a entrada do
 * seu papel. Se o token não servir mais, a falha do /users/me libera a tela —
 * melhor mostrar o login do que travar em erro.
 */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    return true;
  }
  return auth.me().pipe(
    map((user) => router.parseUrl(entradaDe(user.role))),
    catchError(() => of(true)),
  );
};
