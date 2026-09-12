import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';

import { Icone } from '../icone/icone';

/**
 * Modal da ativação, em dois momentos:
 *  - modo 'enviado'     (após o registro): "e-mail de ativação enviado"
 *  - modo 'nao-ativado' (login recusado): a conta pode estar inativa
 *
 * Quem ativa é o link do e-mail, que bate direto no backend. Aqui não se pede
 * código nenhum: a modal informa e oferece o reenvio.
 */
export type ActivationModalMode = 'enviado' | 'nao-ativado';

/** Elementos que recebem foco por Tab dentro da modal. */
const FOCAVEIS = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

@Component({
  selector: 'app-activation-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icone],
  templateUrl: './activation-modal.html',
  styleUrl: './activation-modal.scss',
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class ActivationModal {
  readonly open = input<boolean>(false);
  readonly mode = input<ActivationModalMode>('enviado');
  readonly email = input<string>('');
  /** Reenvio do e-mail em andamento. */
  readonly sending = input<boolean>(false);
  readonly erro = input<string>('');
  readonly sucesso = input<string>('');

  readonly closed = output<void>();
  readonly resend = output<void>();

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  private ultimoFoco: HTMLElement | null = null;

  constructor() {
    // Abrir move o foco para a modal; fechar devolve para quem a abriu -
    // sem isso o aria-modal seria promessa vazia para leitores de tela.
    effect(() => {
      const dialog = this.dialog();
      if (this.open() && dialog) {
        this.ultimoFoco = document.activeElement as HTMLElement | null;
        dialog.nativeElement.focus();
      } else if (!this.open() && this.ultimoFoco) {
        this.ultimoFoco.focus();
        this.ultimoFoco = null;
      }
    });
  }

  onEscape(): void {
    if (this.open()) {
      this.closed.emit();
    }
  }

  /**
   * Prende o Tab dentro da modal. O `shift` vem do template porque cada
   * combinação tem seu próprio binding - evita destrinchar o KeyboardEvent.
   */
  protected onTab(event: Event, shift: boolean): void {
    const dialog = this.dialog()?.nativeElement;
    if (!dialog) {
      return;
    }
    const focaveis = Array.from(dialog.querySelectorAll<HTMLElement>(FOCAVEIS));
    if (focaveis.length === 0) {
      return;
    }
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    const ativo = document.activeElement;

    if (shift && (ativo === primeiro || ativo === dialog)) {
      event.preventDefault();
      ultimo.focus();
    } else if (!shift && ativo === ultimo) {
      event.preventDefault();
      primeiro.focus();
    }
  }
}
