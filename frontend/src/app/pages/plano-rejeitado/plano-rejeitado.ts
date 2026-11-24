import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import { APP_ROUTES } from '../../core/constants/app-constants';
import { ApiError } from '../../core/models/auth';
import { DecisaoPlano, JsonQuestionario } from '../../core/models/questionario';
import { QuestionarioService } from '../../core/services/questionario';
import { Icone } from '../../shared/components/icone/icone';
import { TopoSessao } from '../../shared/components/topo-sessao/topo-sessao';

/**
 * Plano devolvido: o motivo e o caminho de volta ao formulário. O próprio
 * incubado reabre para corrigir (24/11/2026); as notas aparecem no formulário.
 */
@Component({
  selector: 'app-plano-rejeitado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icone, TopoSessao],
  templateUrl: './plano-rejeitado.html',
})
export class PlanoRejeitado implements OnInit {
  private readonly service = inject(QuestionarioService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly json = signal<JsonQuestionario | null>(null);
  protected readonly mensagemErro = signal('');
  protected readonly carregado = computed(() => this.json() !== null);
  protected readonly reabrindo = signal(false);

  /** O motivo escrito por quem devolveu, quando o documento já o traz. */
  protected readonly devolucao = computed<DecisaoPlano | null>(() => {
    const decisao = this.json()?.decisao;
    return decisao?.status === 'rejeitado' && decisao.justificativa ? decisao : null;
  });

  /** Data curta em PT-BR; data inválida some, em vez de virar "Invalid Date". */
  protected dataLegivel(iso: string): string {
    const data = new Date(iso);
    return Number.isNaN(data.getTime()) ? '' : data.toLocaleDateString('pt-BR');
  }

  ngOnInit(): void {
    this.service
      .meu()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (plano) => this.json.set(plano.json_questionario),
        error: (err: ApiError) => this.mensagemErro.set(err.message),
      });
  }

  /** Volta o plano para edição e abre o formulário, com o motivo no topo. */
  protected corrigir(): void {
    this.reabrindo.set(true);
    this.mensagemErro.set('');
    this.service
      .corrigir()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => void this.router.navigate([APP_ROUTES.questionario]),
        error: (err: ApiError) => {
          this.reabrindo.set(false);
          this.mensagemErro.set(err.message);
        },
      });
  }
}
