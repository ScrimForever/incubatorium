import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

/** Teclas de navegação: só elas ligam o anel de foco. Digitar texto não. */
const TECLAS_NAVEGACAO = new Set([
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/**
 * Casca da aplicação. Além do outlet, cuida do que só existe uma vez: o atalho
 * para pular o menu, o anúncio da troca de página - numa SPA o leitor de tela
 * não percebe a navegação sozinho, e o foco fica onde estava - e o modo de
 * navegação que liga o anel de foco.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  host: {
    '(document:keydown)': 'aoTeclar($event)',
    '(document:pointerdown)': 'aoApontar()',
  },
  template: `
    <a class="pular-conteudo" href="#conteudo">Pular para o conteúdo</a>
    <router-outlet />
    <p class="apenas-leitor-tela" role="status" aria-live="polite">{{ anuncio() }}</p>
  `,
})
export class App {
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly raiz = inject(DOCUMENT).documentElement;

  protected readonly anuncio = signal('');

  constructor() {
    this.router.events
      .pipe(
        filter((evento) => evento instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.anuncio.set(this.tituloDaRota());
        // O foco só pode mudar depois que a página nova existir no DOM. Sem
        // `preventScroll`, focar um `main` mais alto que a tela rolava a página
        // 64px e escondia a barra do topo, com o botão Sair. Quem põe a página
        // no topo é o roteador (`withInMemoryScrolling`).
        afterNextRender(() => document.getElementById('conteudo')?.focus({ preventScroll: true }), {
          injector: this.injector,
        });
      });
  }

  /**
   * O anel de foco é para quem navega pelo teclado. O `:focus-visible` sozinho
   * não basta: o Chrome também o acende quando o foco muda por código - abrir
   * uma modal, devolver o foco ao botão que a abriu -, e quem usou o mouse via
   * uma borda azul sem ter pedido. A classe na raiz liga e desliga o anel no CSS.
   */
  protected aoTeclar(evento: KeyboardEvent): void {
    if (TECLAS_NAVEGACAO.has(evento.key)) {
      this.raiz.classList.add('navegando-teclado');
    }
  }

  protected aoApontar(): void {
    this.raiz.classList.remove('navegando-teclado');
  }

  /**
   * Título da rota mais profunda, lido do snapshot e não do serviço Title:
   * o documento só é atualizado depois do NavigationEnd, e aí o anúncio sairia
   * sempre uma página atrasado.
   */
  private tituloDaRota(): string {
    let rota: ActivatedRouteSnapshot = this.router.routerState.snapshot.root;
    while (rota.firstChild) {
      rota = rota.firstChild;
    }
    return rota.title ?? '';
  }
}
