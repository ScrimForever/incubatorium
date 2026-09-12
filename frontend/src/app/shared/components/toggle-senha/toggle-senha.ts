import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Botão de olho para campos de senha: alterna entre mostrar e ocultar.
 * Usar dentro de um `.input-senha` (estilos globais em styles.scss).
 */
@Component({
  selector: 'app-toggle-senha',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: contents;
    }
  `,
  template: `
    <button
      type="button"
      class="toggle-senha"
      [attr.aria-label]="visible() ? 'Ocultar senha' : 'Mostrar senha'"
      [attr.aria-pressed]="visible()"
      (click)="toggled.emit()"
    >
      @if (visible()) {
        <!-- olho cortado: senha visível, clique oculta -->
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
          />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      } @else {
        <!-- olho aberto: senha oculta, clique mostra -->
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      }
    </button>
  `,
})
export class ToggleSenha {
  readonly visible = input<boolean>(false);
  readonly toggled = output<void>();
}
