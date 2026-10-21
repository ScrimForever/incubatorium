import { HttpInterceptorFn } from '@angular/common/http';
import { usuariosMockInterceptor } from '../app/core/mocks/usuarios-mock-interceptor';

/**
 * Ambiente de desenvolvimento. Só aqui os mocks são importados, e cada um
 * responde apenas o que o backend ainda não publica: hoje, só a listagem de
 * usuários (`GET /users`).
 */
export const environment = {
  usaMock: true,
  interceptoresExtras: [usuariosMockInterceptor] as HttpInterceptorFn[],
};
