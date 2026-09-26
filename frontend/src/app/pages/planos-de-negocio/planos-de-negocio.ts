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
import { RouterLink } from '@angular/router';

import { APP_ROUTES } from '../../core/constants/app-constants';
import { ApiError, SessionUser } from '../../core/models/auth';
import { PlanoResumo } from '../../core/models/plano';
import { ROTULO_STATUS, StatusQuestionario } from '../../core/models/questionario';
import { Auth } from '../../core/services/auth';
import { PlanosService } from '../../core/services/planos';
import { Icone } from '../../shared/components/icone/icone';
import { Painel } from '../../shared/components/painel/painel';

/**
 * Uma linha da lista, com o que já dá para mostrar sem abrir o documento.
 *
 * **Sem e-mail**: quem avalia reconhece o plano pelo negócio e por quem o
 * propôs; o e-mail é chave de rota, não identidade de tela — ele continua na
 * URL, que é onde serve para alguma coisa.
 */
interface Linha extends PlanoResumo {
  readonly rotuloStatus: string;
  readonly classeStatus: string;
  readonly rota: string;
  readonly quando: string;
  readonly negocio: string;
  readonly proponente: string;
}

/**
 * Um filtro por situação real do plano, na ordem do fluxo, com os rótulos
 * oficiais (`ROTULO_STATUS`) — nada de nome inventado aqui, senão a pílula diz
 * uma coisa e o selo do cartão diz outra. "Todos" fecha a lista, como na tela
 * de usuários.
 *
 * Os cinco aparecem, inclusive `iniciado` e `pendente`: eles ainda estão com o
 * incubado, mas existem, e quem coordena precisa enxergar quem nem começou.
 */
const FILTROS: readonly { valor: StatusQuestionario | 'todos'; rotulo: string }[] = [
  ...(['aguardando_aprovacao', 'rejeitado', 'aprovado', 'pendente', 'iniciado'] as const).map(
    (valor) => ({ valor, rotulo: ROTULO_STATUS[valor] }),
  ),
  { valor: 'todos' as const, rotulo: 'Todos' },
];

@Component({
  selector: 'app-planos-de-negocio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Painel, Icone, RouterLink],
  templateUrl: './planos-de-negocio.html',
  styleUrl: './planos-de-negocio.scss',
})
export class PlanosDeNegocio implements OnInit {
  private readonly auth = inject(Auth);
  private readonly planos = inject(PlanosService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly user = signal<SessionUser | null>(null);
  protected readonly carregando = signal(true);
  protected readonly mensagemErro = signal('');
  protected readonly filtro = signal<StatusQuestionario | 'todos'>('aguardando_aprovacao');
  protected readonly filtros = FILTROS;

  private readonly resumos = signal<PlanoResumo[]>([]);

  protected readonly linhas = computed<Linha[]>(() =>
    this.resumos().map((plano) => ({
      ...plano,
      rotuloStatus: ROTULO_STATUS[plano.status_questionario],
      classeStatus: `selo selo--${plano.status_questionario}`,
      rota: APP_ROUTES.planoDe(plano.usuario_email),
      quando: dataLegivel(plano.atualizado_em ?? plano.criado_em),
      // Enquanto o backend não devolver os nomes, o mock preenche; sem eles a
      // linha diz que falta o dado, e não um e-mail no lugar do nome.
      negocio: plano.nome_negocio || 'Negócio sem nome',
      proponente: plano.nome_proponente || 'Proponente não informado',
    })),
  );

  ngOnInit(): void {
    this.auth
      .me()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (user) => this.user.set(user), error: () => this.user.set(null) });
    this.buscar();
  }

  protected trocarFiltro(valor: StatusQuestionario | 'todos'): void {
    if (valor !== this.filtro()) {
      this.filtro.set(valor);
      this.buscar();
    }
  }

  private buscar(): void {
    this.carregando.set(true);
    this.mensagemErro.set('');
    const filtro = this.filtro();
    this.planos
      .listar(filtro === 'todos' ? undefined : filtro)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (planos) => {
          this.resumos.set(planos);
          this.carregando.set(false);
        },
        error: (err: ApiError) => {
          this.resumos.set([]);
          this.carregando.set(false);
          this.mensagemErro.set(err.message);
        },
      });
  }
}

/** Data curta, em PT-BR; sem data, um traço — melhor que "Invalid Date". */
function dataLegivel(iso?: string | null): string {
  if (!iso) {
    return '—';
  }
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleDateString('pt-BR');
}
