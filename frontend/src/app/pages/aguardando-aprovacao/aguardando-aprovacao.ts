import { ChangeDetectionStrategy, Component } from '@angular/core';

import { Icone } from '../../shared/components/icone/icone';
import { TopoSessao } from '../../shared/components/topo-sessao/topo-sessao';

/**
 * Plano enviado, à espera do avaliador. Não há o que preencher nem para onde
 * navegar (o painel só abre com o plano aprovado): tela cheia, sem menu e sem notas.
 */
@Component({
  selector: 'app-aguardando-aprovacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icone, TopoSessao],
  templateUrl: './aguardando-aprovacao.html',
})
export class AguardandoAprovacao {}
