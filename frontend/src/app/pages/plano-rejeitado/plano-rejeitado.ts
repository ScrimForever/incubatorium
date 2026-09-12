import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ApiError } from '../../core/models/auth';
import { JsonQuestionario } from '../../core/models/questionario';
import { QuestionarioService } from '../../core/services/questionario';
import { Icone } from '../../shared/components/icone/icone';
import { PlanoLeitura } from '../../shared/components/plano-leitura/plano-leitura';
import { TopoSessao } from '../../shared/components/topo-sessao/topo-sessao';

/**
 * Plano devolvido pelo avaliador, somente leitura.
 *
 * Quem reabre o plano é o avaliador, mudando o status — não há caminho de volta
 * ao formulário por aqui. O que resta ao incubado é ler o que foi apontado em
 * cada etapa, e é isso que a tela mostra.
 */
@Component({
  selector: 'app-plano-rejeitado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icone, PlanoLeitura, TopoSessao],
  templateUrl: './plano-rejeitado.html',
})
export class PlanoRejeitado implements OnInit {
  private readonly service = inject(QuestionarioService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly json = signal<JsonQuestionario | null>(null);
  protected readonly mensagemErro = signal('');

  ngOnInit(): void {
    this.service
      .meu()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (plano) => this.json.set(plano.json_questionario),
        error: (err: ApiError) => this.mensagemErro.set(err.message),
      });
  }
}
