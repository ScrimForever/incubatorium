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
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { APP_ROUTES } from '../../core/constants/app-constants';
import { ApiError, SessionUser } from '../../core/models/auth';
import { PlanoResumo } from '../../core/models/plano';
import { ROTULO_STATUS, StatusQuestionario } from '../../core/models/questionario';
import { Auth } from '../../core/services/auth';
import { PlanosService } from '../../core/services/planos';
import { Icone } from '../../shared/components/icone/icone';
import { DesignarAvaliadoresModal } from '../../shared/components/designar-avaliadores-modal/designar-avaliadores-modal';
import { Paginacao } from '../../shared/components/paginacao/paginacao';
import { Painel } from '../../shared/components/painel/painel';
import { ToastService } from '../../core/services/toast';

/**
 * Uma linha da lista. Sem e-mail à vista: quem avalia reconhece o plano pelo
 * negócio e pelo proponente; o e-mail é chave de rota e fica só na URL.
 */
interface Linha extends PlanoResumo {
  readonly rotuloStatus: string;
  readonly classeStatus: string;
  readonly rota: string;
  readonly emAnalise: boolean;
  readonly quando: string;
  readonly negocio: string;
  readonly proponente: string;
}

/** Planos por página na listagem. */
const POR_PAGINA = 10;

/**
 * Filtros por situação real do plano, na ordem do fluxo e com os rótulos oficiais
 * (`ROTULO_STATUS`), para a aba, o selo e o rodapé do plano dizerem a mesma coisa.
 */
const FILTROS: readonly { valor: StatusQuestionario | 'todos'; rotulo: string }[] = [
  { valor: 'todos' as const, rotulo: 'Todos' },
  ...(['iniciado', 'pendente', 'aguardando_aprovacao', 'aprovado', 'rejeitado'] as const).map(
    (valor) => ({ valor, rotulo: ROTULO_STATUS[valor] }),
  ),
];

@Component({
  selector: 'app-planos-de-negocio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Painel, Icone, RouterLink, DesignarAvaliadoresModal, Paginacao, ReactiveFormsModule],
  templateUrl: './planos-de-negocio.html',
  styleUrl: './planos-de-negocio.scss',
})
export class PlanosDeNegocio implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly planos = inject(PlanosService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);

  /** A aba ativa fica no service: sobrevive à ida ao plano e à volta. */
  protected readonly filtro = this.planos.filtroLista;

  protected readonly user = signal<SessionUser | null>(null);
  protected readonly carregando = signal(true);
  protected readonly mensagemErro = signal('');
  protected readonly filtros = FILTROS;
  protected readonly planoSelecionado = signal<string | null>(null);
  protected readonly busca = this.fb.nonNullable.control('');
  private readonly termo = signal('');

  private readonly resumos = signal<PlanoResumo[]>([]);

  /** E-mail do plano cuja modal de avaliadores está aberta; nulo = fechada. */
  protected readonly designando = signal<string | null>(null);

  /** O botão de designar avaliadores é só da coordenação. */
  protected readonly ehAdmin = computed(() => this.user()?.role === 'admin');

  protected readonly porPagina = POR_PAGINA;
  protected readonly pagina = signal(1);

  /**
   * Mais recente primeiro, pela data de atualização (ou de criação), já com a
   * busca aplicada (negócio, proponente ou e-mail do dono).
   */
  protected readonly linhas = computed<Linha[]>(() => {
    const termo = this.termo().trim().toLowerCase();
    return [...this.resumos()]
      .filter((plano) => !termo || alvoDaBusca(plano).includes(termo))
      .sort((a, b) => quando(b) - quando(a))
      .map((plano) => ({
        ...plano,
        rotuloStatus: ROTULO_STATUS[plano.status_questionario],
        classeStatus: `selo selo--${plano.status_questionario}`,
        rota: APP_ROUTES.planoDe(plano.usuario_email),
        emAnalise: plano.status_questionario === 'aguardando_aprovacao',
        quando: dataLegivel(plano.atualizado_em ?? plano.criado_em),
        // Etapa 1 ainda vazia: a linha diz que falta o dado, e não um e-mail no
        // lugar do nome.
        negocio: plano.nome_negocio || 'Negócio sem nome',
        proponente: plano.nome_proponente || 'Proponente não informado',
      }));
  });

  protected readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.linhas().length / POR_PAGINA)),
  );

  /** Página corrente já presa ao total (trocar de filtro encolhe a lista). */
  protected readonly paginaAtual = computed(() => Math.min(this.pagina(), this.totalPaginas()));

  protected readonly linhasPaginadas = computed(() => {
    const inicio = (this.paginaAtual() - 1) * POR_PAGINA;
    return this.linhas().slice(inicio, inicio + POR_PAGINA);
  });

  protected irParaPagina(n: number): void {
    this.pagina.set(Math.min(Math.max(1, n), this.totalPaginas()));
  }

  ngOnInit(): void {
    this.busca.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => {
      this.termo.set(v);
      this.pagina.set(1);
    });

    this.auth
      .me()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.user.set(user);
          // Primeira visita desta conta: avaliador abre nos aprovados (os que ele avalia).
          if (this.planos.donoFiltro() !== user.email) {
            this.planos.donoFiltro.set(user.email);
            this.filtro.set(user.role === 'avaliador' ? 'aprovado' : 'todos');
          }
          this.buscar();
        },
        error: () => {
          this.user.set(null);
          this.carregando.set(false);
        },
      });
  }

  protected trocarFiltro(valor: StatusQuestionario | 'todos'): void {
    if (valor !== this.filtro()) {
      this.filtro.set(valor);
      this.pagina.set(1);
      this.buscar();
    }
  }

  protected designar(email: string): void {
    this.designando.set(email);
  }

  protected fecharDesignacao(): void {
    this.designando.set(null);
  }

  /** Enviou para avaliação: a modal fecha e a lista recarrega sem o plano que saiu. */
  protected designado(): void {
    this.designando.set(null);
    this.toast.sucesso('Plano enviado para avaliação.');
    this.buscar();
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
          this.pagina.set(1);
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

/** O que a busca varre: nome do negócio, proponente e e-mail do dono. */
function alvoDaBusca(plano: PlanoResumo): string {
  return [plano.nome_negocio, plano.nome_proponente, plano.usuario_email]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Para ordenar: data de atualização, ou de criação; sem data, vai para o fim. */
function quando(plano: PlanoResumo): number {
  const iso = plano.atualizado_em ?? plano.criado_em;
  const ms = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(ms) ? 0 : ms;
}

/** Data curta, em PT-BR; sem data, um traço — melhor que "Invalid Date". */
function dataLegivel(iso?: string | null): string {
  if (!iso) {
    return '—';
  }
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleDateString('pt-BR');
}
