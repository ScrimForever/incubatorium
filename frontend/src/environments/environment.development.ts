import { HttpInterceptorFn } from '@angular/common/http';
import { usuariosMockInterceptor } from '../app/core/mocks/usuarios-mock-interceptor';

/**
 * Ambiente de DESENVOLVIMENTO.
 *
 * Só aqui os mocks são importados, e cada um responde apenas o que o backend
 * ainda não publica. Hoje sobrou um: a listagem de usuários (`GET /users`).
 * Todo o resto — autenticação, /users/me, as ações por id e o questionário
 * inteiro — vai para a API real.
 *
 */
export const environment = {
  usaMock: true,
  interceptoresExtras: [usuariosMockInterceptor] as HttpInterceptorFn[],
};
