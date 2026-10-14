import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { JsonQuestionario, NUMEROS_ETAPA } from '../../../core/models/questionario';
import { PlanoEtapaLeitura } from '../plano-etapa-leitura/plano-etapa-leitura';
import { EtapaLida, montarEtapaLida } from './etapa-lida';

/**
 * As nove etapas do plano em leitura, com a avaliação de cada uma. Usado pelo
 * "Meu plano" e pelo plano devolvido; quem avalia mostra uma etapa por vez e
 * usa direto o `plano-etapa-leitura`.
 */
@Component({
  selector: 'app-plano-leitura',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlanoEtapaLeitura],
  templateUrl: './plano-leitura.html',
  styleUrl: './plano-leitura.scss',
})
export class PlanoLeitura {
  readonly json = input.required<JsonQuestionario>();

  protected readonly etapas = computed<EtapaLida[]>(() => {
    const json = this.json();
    return NUMEROS_ETAPA.map((numero) => montarEtapaLida(json, numero));
  });
}
