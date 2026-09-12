import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Ambiente de PRODUÇÃO — o padrão do build.
 *
 * `interceptoresExtras` existe para que o mock nunca chegue aqui: este arquivo
 * não importa nada de `core/mocks/`, então o bundler não tem como incluir o
 * backend falso no bundle publicado. A troca acontece por `fileReplacements`
 * no angular.json, só na configuração de desenvolvimento.
 */
export const environment = {
  usaMock: false,
  interceptoresExtras: [] as HttpInterceptorFn[],
};
