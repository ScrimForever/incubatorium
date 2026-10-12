import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Ambiente de produção, o padrão do build. Não importa nada de `core/mocks/`,
 * então o bundler não tem como incluir o backend falso no bundle publicado; a
 * troca pelo arquivo de desenvolvimento é via `fileReplacements` no angular.json.
 */
export const environment = {
  usaMock: false,
  interceptoresExtras: [] as HttpInterceptorFn[],
};
