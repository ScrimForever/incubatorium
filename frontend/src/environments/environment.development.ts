import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Ambiente de desenvolvimento. Todos os endpoints agora são reais.
 * A listagem de usuários mudou de `GET /users` (mock) para `GET /usuarios/todos` (API real, 11/11/2026).
 */
export const environment = {
  usaMock: false,
  interceptoresExtras: [] as HttpInterceptorFn[],
};
