import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { APP_ROUTES } from '../constants/app-constants';
import { Auth } from '../services/auth';

/**
 * Barra as rotas privadas antes de o componente carregar. Sem bearer token
 * válido, devolve a URL do login - nenhuma página checa sessão no ngOnInit.
 */
export const authGuard: CanActivateFn = () =>
  inject(Auth).isLoggedIn() || inject(Router).parseUrl(APP_ROUTES.login);
