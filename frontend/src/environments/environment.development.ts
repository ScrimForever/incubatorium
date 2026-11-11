import { HttpInterceptorFn } from '@angular/common/http';
import { usuariosMockInterceptor } from '../app/core/mocks/usuarios-mock-interceptor';

/**
 * Ambiente de desenvolvimento. Só aqui o mock é importado, e ele responde
 * apenas o que o backend ainda não publica: a listagem de usuários
 * (`GET /users`). A designação de avaliadores agora é API real.
 */
export const environment = {
  usaMock: true,
  interceptoresExtras: [usuariosMockInterceptor] as HttpInterceptorFn[],
};
