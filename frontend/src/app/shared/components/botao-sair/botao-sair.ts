import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { Auth } from '../../../core/services/auth';
import { Icone } from '../icone/icone';

const FOCAVEIS = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * O botão "Sair" das barras superiores, com a confirmação antes de encerrar a
 * sessão. Compartilhado porque o painel e as telas cheias (questionário,
 * plano em análise, plano devolvido) usam o mesmo — e um clique sem querer
 * ali descartaria o que ainda não foi salvo.
 */
@Component({
  selector: 'app-botao-sair',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icone],
  templateUrl: './botao-sair.html',
  // O botão continua sendo item direto do flex da barra.
  styles: `
    :host {
      display: contents;
    }
  `,
  host: {
    '(document:keydown.escape)': 'cancelar()',
  },
})
export class BotaoSair {
  private readonly auth = inject(Auth);

  protected readonly confirmando = signal(false);

  private readonly botao = viewChild.required<ElementRef<HTMLButtonElement>>('botao');
  private readonly dialogo = viewChild<ElementRef<HTMLElement>>('dialogo');

  constructor() {
    // Abrir move o foco para a modal; cancelar devolve ao botão — o mesmo
    // contrato das outras modais do app.
    let estavaAberta = false;
    effect(() => {
      const dialogo = this.dialogo();
      if (this.confirmando() && dialogo) {
        estavaAberta = true;
        dialogo.nativeElement.focus();
      } else if (!this.confirmando() && estavaAberta) {
        estavaAberta = false;
        this.botao().nativeElement.focus();
      }
    });
  }

  protected pedir(): void {
    this.confirmando.set(true);
  }

  protected cancelar(): void {
    if (this.confirmando()) {
      this.confirmando.set(false);
    }
  }

  protected confirmar(): void {
    this.auth.sair();
  }

  /** Prende o Tab dentro da modal. O `shift` vem do template, como no padrão. */
  protected prenderTab(evento: Event, shift: boolean): void {
    const dialogo = this.dialogo()?.nativeElement;
    if (!dialogo) {
      return;
    }
    const focaveis = Array.from(dialogo.querySelectorAll<HTMLElement>(FOCAVEIS));
    if (focaveis.length === 0) {
      return;
    }
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    const ativo = document.activeElement;

    if (shift && (ativo === primeiro || ativo === dialogo)) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!shift && ativo === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }
}
