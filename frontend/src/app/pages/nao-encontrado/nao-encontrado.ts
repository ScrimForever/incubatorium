import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { APP_ROUTES } from '../../core/constants/app-constants';
import { Auth } from '../../core/services/auth';
import { Icone } from '../../shared/components/icone/icone';

/**
 * Rota inválida. Tem tela própria em vez de redirecionar calado para o login:
 * redirecionar esconde link quebrado e confunde quem já tem sessão.
 */
@Component({
  selector: 'app-nao-encontrado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icone],
  templateUrl: './nao-encontrado.html',
})
export class NaoEncontrado {
  private readonly auth = inject(Auth);

  /** Quem tem sessão volta para o painel; quem não tem, para o login. */
  protected readonly logado = computed(() => this.auth.isLoggedIn());
  protected readonly rotas = APP_ROUTES;
}
