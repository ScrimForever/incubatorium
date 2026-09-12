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
import { ApiError, SessionUser } from '../../core/models/auth';
import { Questionario, ROTULO_STATUS } from '../../core/models/questionario';
import { Auth } from '../../core/services/auth';
import { QuestionarioService } from '../../core/services/questionario';
import { Icone } from '../../shared/components/icone/icone';
import { Painel } from '../../shared/components/painel/painel';
import { PlanoLeitura } from '../../shared/components/plano-leitura/plano-leitura';

/**
 * Meu plano — item do painel, e portanto só do incubado com o plano aprovado.
 * Os estados anteriores têm telas próprias: `/aguardando-aprovacao` e
 * `/plano-rejeitado`.
 *
 * Aqui o plano aparece no mesmo formato do formulário, reduzido e somente
 * leitura, com a avaliação do consultor em cada etapa.
 */
@Component({
  selector: 'app-meu-plano',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Painel, Icone, PlanoLeitura],
  templateUrl: './meu-plano.html',
  styleUrl: './meu-plano.scss',
})
export class MeuPlano implements OnInit {
  private readonly auth = inject(Auth);
  private readonly service = inject(QuestionarioService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly user = signal<SessionUser | null>(null);
  protected readonly plano = signal<Questionario | null>(null);
  protected readonly mensagemErro = signal('');

  protected readonly rotuloStatus = computed(() => {
    const plano = this.plano();
    return plano ? ROTULO_STATUS[plano.status_questionario] : '';
  });

  ngOnInit(): void {
    this.auth
      .me()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => this.user.set(user),
        error: () => {
          this.auth.clearSession();
          void this.router.navigate([APP_ROUTES.login]);
        },
      });

    this.service
      .meu()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (plano) => this.plano.set(plano),
        error: (err: ApiError) => this.mensagemErro.set(err.message),
      });
  }
}
