import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth-interceptor';
import { errorInterceptor } from './core/interceptors/error-interceptor';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Padrão do scaffold do Angular 20 (zone-based). Zoneless ainda é
    // developer preview; migrar é trocar este provider quando estabilizar.
    provideZoneChangeDetection({ eventCoalescing: true }),
    // withComponentInputBinding: params de rota e query string chegam às
    // páginas como input() - nada de ActivatedRoute.snapshot.
    provideRouter(routes, withComponentInputBinding()),
    // Ordem fixa: auth injeta o token, erro normaliza a falha que volta.
    provideHttpClient(
      withInterceptors([authInterceptor, errorInterceptor, ...environment.interceptoresExtras]),
    ),
  ],
};
