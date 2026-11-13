import { Injectable, signal } from '@angular/core';

export interface ToastItem {
  readonly id: number;
  readonly mensagem: string;
}

/** Quanto tempo o aviso fica na tela. */
const DURACAO_MS = 4000;

/**
 * Avisos de sucesso que sobrevivem à troca de tela (fechar modal, voltar para a
 * lista). Um só lugar desenha: o `Toast` no `App`.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private proximoId = 0;
  readonly itens = signal<ToastItem[]>([]);

  sucesso(mensagem: string): void {
    const id = ++this.proximoId;
    this.itens.update((lista) => [...lista, { id, mensagem }]);
    setTimeout(() => this.fechar(id), DURACAO_MS);
  }

  fechar(id: number): void {
    this.itens.update((lista) => lista.filter((item) => item.id !== id));
  }
}
