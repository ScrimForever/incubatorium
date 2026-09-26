import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ROLE_LABEL } from '../../../core/constants/app-constants';
import { SessionUser } from '../../../core/models/auth';
import { Auth } from '../../../core/services/auth';
import { BotaoSair } from '../botao-sair/botao-sair';

/**
 * Barra superior das telas que ocupam a tela inteira, fora do painel: logo,
 * quem está logado e o botão de sair. Mesma barra do painel, sem o menu —
 * nessas telas não há para onde navegar.
 *
 * Falha ao carregar o usuário não mostra erro: o 401 já derruba a sessão no
 * interceptor, e o cabeçalho apenas encolhe.
 */
@Component({
  selector: 'app-topo-sessao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BotaoSair],
  templateUrl: './topo-sessao.html',
})
export class TopoSessao implements OnInit {
  private readonly auth = inject(Auth);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly user = signal<SessionUser | null>(null);
  protected readonly ROLE_LABEL = ROLE_LABEL;

  ngOnInit(): void {
    this.auth
      .me()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (user) => this.user.set(user) });
  }
}
