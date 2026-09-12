import { ChangeDetectionStrategy, Component } from '@angular/core';

import { Icone } from '../../shared/components/icone/icone';
import { TopoSessao } from '../../shared/components/topo-sessao/topo-sessao';

/**
 * Plano enviado, à espera do avaliador.
 *
 * Não há o que preencher nem para onde navegar: o documento saiu das mãos do
 * incubado e o painel só abre com o plano aprovado. Por isso é tela cheia sem
 * menu, e sem as notas — nesta altura ainda não existe nenhuma.
 */
@Component({
  selector: 'app-aguardando-aprovacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icone, TopoSessao],
  templateUrl: './aguardando-aprovacao.html',
})
export class AguardandoAprovacao {}
