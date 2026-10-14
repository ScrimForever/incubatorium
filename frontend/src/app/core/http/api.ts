import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from '../constants/api-routes';

/**
 * Único ponto do app que conhece a base da API e monta URLs.
 * Componentes nunca usam HttpClient - sempre página -> service -> Api.
 */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  get<T>(endpoint: string): Observable<T> {
    return this.http.get<T>(this.url(endpoint));
  }

  post<T>(endpoint: string, body?: unknown): Observable<T> {
    return this.http.post<T>(this.url(endpoint), body ?? {});
  }

  put<T>(endpoint: string, body: unknown): Observable<T> {
    return this.http.put<T>(this.url(endpoint), body);
  }

  patch<T>(endpoint: string, body: unknown): Observable<T> {
    return this.http.patch<T>(this.url(endpoint), body);
  }

  delete<T>(endpoint: string): Observable<T> {
    return this.http.delete<T>(this.url(endpoint));
  }

  /**
   * `DELETE` com corpo — exigido pelo `DELETE /arquivos/questionario/{aba}`,
   * que recebe a lista de nomes a apagar no corpo em vez de na URL.
   */
  deleteComCorpo<T>(endpoint: string, body: unknown): Observable<T> {
    return this.http.delete<T>(this.url(endpoint), { body });
  }

  /**
   * `POST` que devolve binário — o download de anexo. A resposta não é JSON,
   * então o `responseType` tem de sair do padrão.
   */
  postBlob(endpoint: string, body: unknown): Observable<Blob> {
    return this.http.post(this.url(endpoint), body, { responseType: 'blob' });
  }

  /**
   * multipart/form-data - exigido pelo POST /arquivos/questionario/{aba}. Sem
   * `Content-Type` de propósito: só o navegador conhece o boundary, e declarar
   * o header aqui quebra o upload.
   */
  postMultipart<T>(endpoint: string, dados: FormData): Observable<T> {
    return this.http.post<T>(this.url(endpoint), dados);
  }

  /** x-www-form-urlencoded - exigido pelo /auth/jwt/login do fastapi-users. */
  postForm<T>(endpoint: string, data: Record<string, string>): Observable<T> {
    return this.http.post<T>(this.url(endpoint), new URLSearchParams(data).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  }

  private url(endpoint: string): string {
    return `${API_BASE}${endpoint}`;
  }
}
