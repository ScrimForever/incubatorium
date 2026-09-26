import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideQuillConfig } from 'ngx-quill/config';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth-interceptor';
import { errorInterceptor } from './core/interceptors/error-interceptor';
import { environment } from '../environments/environment';
import { EDITOR_CONFIG } from './shared/editor/editor-config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Padrão do scaffold do Angular 20 (zone-based). Zoneless ainda é
    // developer preview; migrar é trocar este provider quando estabilizar.
    provideZoneChangeDetection({ eventCoalescing: true }),
    // withComponentInputBinding: params de rota e query string chegam às
    // páginas como input() - nada de ActivatedRoute.snapshot.
    // withInMemoryScrolling: página nova abre no topo; voltar restaura a rolagem.
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
    ),
    // Ordem fixa: auth injeta o token, erro normaliza a falha que volta.
    provideHttpClient(
      withInterceptors([authInterceptor, errorInterceptor, ...environment.interceptoresExtras]),
    ),
    // Só a configuração: o Quill em si é carregado sob demanda pelo ngx-quill.
    provideQuillConfig(EDITOR_CONFIG),
  ],
};
