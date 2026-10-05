import { Injectable } from '@angular/core';
import { STORAGE_TOKEN_KEY } from '../constants/app-constants';

/**
 * Tem forma de JWT? Só a forma — assinatura e validade são da API. Serve para o
 * roteador separar o token do e-mail de um endereço errado qualquer.
 */
export function pareceJwt(texto: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(texto);
}

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
