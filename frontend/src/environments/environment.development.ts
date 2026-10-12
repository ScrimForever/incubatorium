import { HttpInterceptorFn } from '@angular/common/http';
import { avaliacaoMockInterceptor } from '../app/core/mocks/avaliacao-mock-interceptor';
import { usuariosMockInterceptor } from '../app/core/mocks/usuarios-mock-interceptor';

/**
 * Ambiente de desenvolvimento. Só aqui os mocks são importados, e cada um
 * responde apenas o que o backend ainda não publica: a listagem de usuários
 * (`GET /users`), a nota do avaliador e a decisão da coordenação.
 */
export const environment = {
  usaMock: true,
  interceptoresExtras: [usuariosMockInterceptor, avaliacaoMockInterceptor] as HttpInterceptorFn[],
};
