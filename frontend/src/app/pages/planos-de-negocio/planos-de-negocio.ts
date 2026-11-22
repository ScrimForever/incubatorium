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
import { Observable, forkJoin, map } from 'rxjs';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { APP_ROUTES } from '../../core/constants/app-constants';
import { ApiError, SessionUser } from '../../core/models/auth';
import { PlanoResumo } from '../../core/models/plano';
import { ROTULO_STATUS, StatusQuestionario } from '../../core/models/questionario';
import { Auth } from '../../core/services/auth';
import { PlanosService } from '../../core/services/planos';
import { UsuariosService } from '../../core/services/usuarios';
import { Icone } from '../../shared/components/icone/icone';
import { DesignarAvaliadoresModal } from '../../shared/components/designar-avaliadores-modal/designar-avaliadores-modal';
import { Paginacao } from '../../shared/components/paginacao/paginacao';
import { Painel } from '../../shared/components/painel/painel';
import { ToastService } from '../../core/services/toast';

/**
 * Uma linha da lista. Quem avalia reconhece o plano pelo negócio e pelo
 * proponente; sem proponente ainda, o e-mail do dono ocupa o lugar dele.
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
  private readonly usuarios = inject(UsuariosService);
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

  /**
   * O avaliador só recebe os planos designados a ele (já aprovados): abas por
   * situação não dizem nada para ele, então não aparecem.
   */
  protected readonly mostraFiltros = computed(() => this.user()?.role !== 'avaliador');

  protected readonly porPagina = POR_PAGINA;
  protected readonly pagina = signal(1);

  /**
   * Mais recente primeiro, pela data de atualização (ou de criação), já com a
   * busca aplicada (negócio, proponente ou e-mail do dono).
   */
  protected readonly linhas = computed<Linha[]>(() => {
    const termo = this.termo().trim().toLowerCase();
    const filtro = this.mostraFiltros() ? this.filtro() : 'todos';
    return [...this.resumos()]
      .filter((plano) => filtro === 'todos' || plano.status_questionario === filtro)
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
        proponente: plano.nome_proponente || plano.usuario_email,
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
          if (this.planos.donoFiltro() !== user.email) {
            this.planos.donoFiltro.set(user.email);
            this.filtro.set('todos');
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
    // A lista inteira já está na tela: trocar de aba só filtra, sem ir à API.
    if (valor !== this.filtro()) {
      this.filtro.set(valor);
      this.pagina.set(1);
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
    this.toast.sucesso('Avaliadores designados. O plano segue aguardando aprovação.');
    this.buscar();
  }

  /**
   * Para a coordenação, só planos de quem ainda é incubado: o backend não apaga o
   * plano quando a conta troca de papel, e a linha ficava órfã na lista. O
   * avaliador não lê a lista de contas (403) — e recebe só os designados.
   */
  private planosDeIncubados(): Observable<PlanoResumo[]> {
    if (!this.ehAdmin()) {
      return this.planos.listar();
    }
    return forkJoin([this.planos.listar(), this.usuarios.listar()]).pipe(
      map(([planos, contas]) => {
        const incubados = emailsDeIncubados(contas);
        return planos.filter((plano) => incubados.has(plano.usuario_email));
      }),
    );
  }

  private buscar(): void {
    this.carregando.set(true);
    this.mensagemErro.set('');
    this.planosDeIncubados()
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

/** E-mails das contas que hoje são incubadas (só a coordenação lê a lista de contas). */
function emailsDeIncubados(contas: { email: string; is_incubado?: boolean | null }[]): Set<string> {
  return new Set(contas.filter((conta) => conta.is_incubado).map((conta) => conta.email));
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
