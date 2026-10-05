import { HttpInterceptorFn } from '@angular/common/http';
import { avaliacaoMockInterceptor } from '../app/core/mocks/avaliacao-mock-interceptor';
import { usuariosMockInterceptor } from '../app/core/mocks/usuarios-mock-interceptor';

/**
 * Ambiente de DESENVOLVIMENTO.
 *
 * Só aqui os mocks são importados, e cada um responde apenas o que o backend
 * ainda não publica: a listagem de usuários (`GET /users`) e a avaliação de
 * planos (lista, plano de outra pessoa, nota do avaliador e o papel no
 * `/users/me`). Todo o resto — autenticação, o questionário do próprio
 * incubado, os anexos — vai para a API real.
 */
export const environment = {
  usaMock: true,
  interceptoresExtras: [usuariosMockInterceptor, avaliacaoMockInterceptor] as HttpInterceptorFn[],
};
