import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

/**
 * Casca da aplicação. Além do outlet, cuida de duas coisas que só existem uma
 * vez: o atalho para pular o menu e o anúncio da troca de página - numa SPA o
 * leitor de tela não percebe a navegação sozinho, e o foco fica onde estava.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `
    <a class="pular-conteudo" href="#conteudo">Pular para o conteúdo</a>
    <router-outlet />
    <p class="apenas-leitor-tela" role="status" aria-live="polite">{{ anuncio() }}</p>
  `,
})
export class App {
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  protected readonly anuncio = signal('');

  constructor() {
    this.router.events
      .pipe(
        filter((evento) => evento instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.anuncio.set(this.tituloDaRota());
        // O foco só pode mudar depois que a página nova existir no DOM.
        afterNextRender(() => document.getElementById('conteudo')?.focus(), {
          injector: this.injector,
        });
      });
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
