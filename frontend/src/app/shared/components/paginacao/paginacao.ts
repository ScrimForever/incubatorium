import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * Barra de paginação das listagens (Usuários e Planos de negócio). A página
 * corrente e o total vêm de fora — a página mantém o estado, este componente
 * só desenha e avisa a troca.
 */
@Component({
  selector: 'app-paginacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './paginacao.html',
  styleUrl: './paginacao.scss',
})
export class Paginacao {
  /** Página corrente, a partir de 1. */
  readonly pagina = input.required<number>();
  readonly totalPaginas = input.required<number>();
  /** Quantos itens a lista inteira tem — só para a contagem. */
  readonly totalItens = input.required<number>();
  readonly porPagina = input.required<number>();

  readonly irPara = output<number>();

  protected readonly paginas = computed(() =>
    Array.from({ length: this.totalPaginas() }, (_, i) => i + 1),
  );

  protected readonly intervalo = computed(() => {
    const total = this.totalItens();
    if (!total) return '';
    const inicio = (this.pagina() - 1) * this.porPagina() + 1;
    return `${inicio}–${Math.min(inicio + this.porPagina() - 1, total)} de ${total}`;
  });
}
