import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { Icone } from '../icone/icone';

/** Um dia da faixa: "ter / 04 / 9 livres". */
export interface DiaDaFaixa {
  readonly data: string;
  /** Lido pelo leitor de tela: "terça-feira, 04/11, 9 livres". */
  readonly rotulo: string;
  readonly semana: string;
  readonly numero: string;
  readonly detalhe: string;
}

/**
 * Faixa de dias que rola para o lado, sem barra: setas nas pontas, roda do
 * mouse, encaixe por dia, e o dia clicado vem para o meio. Usada no agendamento
 * do incubado e na agenda do consultor.
 */
@Component({
  selector: 'app-faixa-dias',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icone],
  templateUrl: './faixa-dias.html',
  styleUrl: './faixa-dias.scss',
})
export class FaixaDias {
  readonly dias = input.required<readonly DiaDaFaixa[]>();
  readonly selecionado = input('');
  readonly rotulo = input('Dias');
  readonly escolher = output<string>();

  /** As setas andam quase uma largura da faixa, para o último dia visto continuar à vista. */
  protected rolar(faixa: HTMLElement, sentido: number): void {
    faixa.scrollBy({ left: sentido * faixa.clientWidth * 0.8, behavior: 'smooth' });
  }

  /** A roda do mouse rola a faixa para o lado: sem isso, só quem tem trackpad conseguia. */
  protected rolarComRoda(faixa: HTMLElement, evento: WheelEvent): void {
    if (Math.abs(evento.deltaY) <= Math.abs(evento.deltaX)) {
      return;
    }
    const noFim = faixa.scrollLeft + faixa.clientWidth >= faixa.scrollWidth - 1;
    const noComeco = faixa.scrollLeft <= 0;
    // Na ponta, a roda devolve a rolagem para a página.
    if ((evento.deltaY > 0 && noFim) || (evento.deltaY < 0 && noComeco)) {
      return;
    }
    evento.preventDefault();
    faixa.scrollLeft += evento.deltaY;
  }

  /** O dia clicado vem para o meio da faixa. */
  protected clicar(data: string, evento: Event): void {
    this.escolher.emit(data);
    (evento.currentTarget as HTMLElement).scrollIntoView?.({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }
}
