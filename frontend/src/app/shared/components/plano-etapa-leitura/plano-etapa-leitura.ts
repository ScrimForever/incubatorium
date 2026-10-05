import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, TemplateRef, computed, input } from '@angular/core';
import { QuillViewComponent } from 'ngx-quill';

import { CLASSE_NOTA, NumeroEtapa, ROTULO_NOTA } from '../../../core/models/questionario';
import { formatarQuando } from '../../data-hora';
import { Icone } from '../icone/icone';
import { EtapaLida } from '../plano-leitura/etapa-lida';

/**
 * Uma etapa do plano em leitura, com a avaliação dela.
 *
 * É o cartão que o `plano-leitura` repete nas telas do incubado e que o wizard
 * do avaliador mostra uma por vez. O rodapé opcional recebe o número da etapa —
 * é por onde a tela de avaliação encaixa o formulário da nota.
 */
@Component({
  selector: 'app-plano-etapa-leitura',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QuillViewComponent, Icone, NgTemplateOutlet],
  templateUrl: './plano-etapa-leitura.html',
  styleUrl: './plano-etapa-leitura.scss',
})
export class PlanoEtapaLeitura {
  readonly etapa = input.required<EtapaLida>();
  readonly rodapeEtapa = input<TemplateRef<{ $implicit: NumeroEtapa }> | undefined>(undefined);

  protected readonly rotuloNota = ROTULO_NOTA;

  protected readonly quando = formatarQuando;
  protected readonly classeNota = CLASSE_NOTA;

  /** A média cai na cor da nota mais próxima — 3,5 puxa para o 4. */
  protected readonly classeMedia = computed(() => {
    const media = this.etapa().media;
    return media === null ? '' : CLASSE_NOTA[Math.round(media) as 1 | 2 | 3 | 4 | 5];
  });
}
