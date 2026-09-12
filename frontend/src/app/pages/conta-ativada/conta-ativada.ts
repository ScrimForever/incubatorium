import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { APP_ROUTES } from '../../core/constants/app-constants';
import { Icone } from '../../shared/components/icone/icone';

/**
 * Destino do redirect do backend depois que o link do e-mail ativa a conta
 * (GET /validar_email/{email}/{codigo} → RedirectResponse). Tela estática e
 * pública: não chama a API nem lê parâmetro, só confirma e leva ao login.
 * Quem ativa é o backend — o frontend nunca chama /validar_email.
 */
@Component({
  selector: 'app-conta-ativada',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icone],
  templateUrl: './conta-ativada.html',
})
export class ContaAtivada {
  protected readonly rotas = APP_ROUTES;
}
