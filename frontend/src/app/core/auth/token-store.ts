import { Injectable } from '@angular/core';
import { STORAGE_TOKEN_KEY } from '../constants/app-constants';

/**
 * Guarda o bearer token. Propositalmente sem dependências: o auth-interceptor
 * e o Auth usam este store sem criar ciclo de injeção.
 */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  get(): string | null {
    try {
      return localStorage.getItem(STORAGE_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  set(token: string): void {
    try {
      localStorage.setItem(STORAGE_TOKEN_KEY, token);
    } catch {
      // sem storage, a sessão vale só para a navegação atual
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
    } catch {
      // nada a limpar
    }
  }
}
