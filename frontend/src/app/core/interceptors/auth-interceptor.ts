import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TokenStore } from '../auth/token-store';

/** Injeta o bearer token em toda requisição. Nenhum service anexa header na mão. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(TokenStore).get();
  return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);
};
