import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable, of, switchMap } from 'rxjs';

import { APP_ROUTES } from '../../core/constants/app-constants';
import { ApiError, SessionUser } from '../../core/models/auth';
import { Horario, Janela } from '../../core/models/consultoria';
import { Auth } from '../../core/services/auth';
import { PassoTour, TourService } from '../../core/services/tour';
import {
  ConsultoriasService,
  errosDaFaixa,
  errosRemarcacao,
  hojeLocal,
  horaLocal,
  rotuloData,
} from '../../core/services/consultorias';
import { Icone } from '../../shared/components/icone/icone';
import { Painel } from '../../shared/components/painel/painel';

/** O que a modal aberta está confirmando. Uma por vez. */
type Modal =
  | { tipo: 'editar'; janela: Janela }
  | { tipo: 'cancelar-janela'; janela: Janela; reservas: number }
  | { tipo: 'cancelar-dia'; data: string; rotulo: string; janelas: number; reservas: number }
  | { tipo: 'remarcar'; horario: Horario; janela: Janela; incubado: string }
  | { tipo: 'tirar-horario'; horario: Horario; rotulo: string; incubado: string };

/** O tour da listagem; o formulário tem o seu, em Abrir agenda. */
const TOUR: readonly PassoTour[] = [
  {
    alvo: 'novo',
    titulo: 'Abra sua agenda',
    texto:
      'Use o <b>+</b> para escolher os dias e as faixas em que vai atender. Ao publicar, você volta para esta lista.',
  },
  {
    alvo: 'filtros',
    titulo: 'Filtre os dias',
    texto: 'Veja todos os dias, só os que já têm reserva ou só os que ainda estão livres.',
  },
  {
    alvo: 'dia',
    titulo: 'Cada dia da agenda',
    texto:
      'Clique no dia para ver as faixas e quem reservou. Ali você edita ou cancela uma faixa, remarca um horário reservado e, ao lado do nome do dia, cancela o dia inteiro.',
  },
];

/** "Todos" por último, como em Planos de negócio: primeiro os recortes. */
const FILTROS = ['reservas', 'livres', 'todos'] as const;
type Filtro = (typeof FILTROS)[number];
const ROTULO_FILTRO: Record<Filtro, string> = {
  reservas: 'Com reserva',
  livres: 'Sem reserva',
  todos: 'Todos',
};

const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;
const hhmm = (hora: string): string => hora.slice(0, 5);

/**
 * Agenda de consultoria do consultor (legado `generate-consultant`), em lista: um
 * item por dia, que abre mostrando as faixas e quem reservou, com editar,
 * remarcar e cancelar. Abrir agenda é outra tela, pelo botão +.
 */
@Component({
  selector: 'app-meus-horarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, Painel, Icone],
  templateUrl: './meus-horarios.html',
  styleUrl: './meus-horarios.scss',
})
export class MeusHorarios implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly service = inject(ConsultoriasService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly tour = inject(TourService);
  /** A primeira visita é conferida uma vez, com a sessão e a agenda já na tela. */
  private tourConferido = false;

  protected readonly user = signal<SessionUser | null>(null);
  protected readonly janelas = signal<Janela[]>([]);
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly mensagemErro = signal('');
  protected readonly mensagemSucesso = signal('');
  protected readonly erroModal = signal('');
  protected readonly modal = signal<Modal | null>(null);

  protected readonly hoje = hojeLocal();
  protected readonly abrirAgendaRota = APP_ROUTES.abrirAgenda;

  /** `?publicadas=N`, vindo de Abrir agenda: vira o aviso de sucesso e sai da URL. */
  readonly publicadas = input<string>();

  protected readonly filtros = FILTROS;
  protected readonly rotuloFiltro = ROTULO_FILTRO;
  protected readonly filtro = signal<Filtro>('todos');
  /** O dia aberto na lista; vazio = todos fechados. */
  protected readonly aberto = signal('');

  // --- agenda publicada ---

  /** As janelas agrupadas por dia, já com o que o template mostra. */
  protected readonly dias = computed(() => {
    const porData = new Map<string, Janela[]>();
    for (const janela of this.janelas()) {
      porData.set(janela.data, [...(porData.get(janela.data) ?? []), janela]);
    }
    return [...porData.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, janelas]) => {
        const horarios = janelas.flatMap((janela) => janela.horarios);
        const reservas = horarios.filter((horario) => horario.incubado_email).length;
        return {
          data,
          rotulo: rotuloData(data),
          janelas: janelas.length,
          reservas,
          faixasResumo: [...janelas]
            .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
            .map((janela) => `${hhmm(janela.hora_inicio)} às ${hhmm(janela.hora_fim)}`)
            .join(' · '),
          selo: reservas ? plural(reservas, 'reservado', 'reservados') : 'Sem reserva',
          detalhe: `${plural(horarios.length, 'horário', 'horários')} · ${plural(horarios.length - reservas, 'livre', 'livres')}`,
          faixas: [...janelas]
            .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
            .map((janela) => ({
              janela,
              faixa: `${hhmm(janela.hora_inicio)} às ${hhmm(janela.hora_fim)}`,
              duracao: `de ${janela.duracao_minutos} em ${janela.duracao_minutos} min`,
              reservas: janela.horarios.filter((horario) => horario.incubado_email).length,
              horarios: janela.horarios.map((horario) => ({
                horario,
                hora: horaLocal(horario.inicio),
                incubado: horario.incubado_email ?? '',
                rotulo: `${rotuloData(data)}, ${horaLocal(horario.inicio)}`,
              })),
            })),
        };
      });
  });

  protected readonly contagem = computed(() => {
    const dias = this.dias();
    const reservas = dias.filter((dia) => dia.reservas).length;
    return { reservas, livres: dias.length - reservas, todos: dias.length };
  });

  protected readonly diasVisiveis = computed(() => {
    const filtro = this.filtro();
    return this.dias().filter(
      (dia) => filtro === 'todos' || (filtro === 'reservas' ? dia.reservas > 0 : !dia.reservas),
    );
  });

  // --- modais de edição ---

  protected readonly formJanela = this.fb.nonNullable.group({
    hora_inicio: '',
    hora_fim: '',
    duracao_minutos: 45,
  });
  private readonly formJanelaValor = toSignal(this.formJanela.valueChanges, {
    initialValue: this.formJanela.getRawValue(),
  });

  /** Erros da faixa em edição — a mesma regra da abertura, com o "hoje" da janela. */
  protected readonly errosEdicao = computed(() => {
    const modal = this.modal();
    const ehHoje = modal?.tipo === 'editar' && modal.janela.data === this.hoje;
    return errosDaFaixa(this.formJanelaValor(), ehHoje ? horaLocal(new Date().toISOString()) : '');
  });

  protected readonly formHorario = this.fb.nonNullable.group({ hora_inicio: '', hora_fim: '' });
  private readonly formHorarioValor = toSignal(this.formHorario.valueChanges, {
    initialValue: this.formHorario.getRawValue(),
  });

  /** Erros do remarcar: dentro da faixa e, hoje, não no passado. */
  protected readonly errosRemarcar = computed(() => {
    const modal = this.modal();
    if (modal?.tipo !== 'remarcar') {
      return { inicio: '', fim: '' };
    }
    const { hora_inicio = '', hora_fim = '' } = this.formHorarioValor();
    return errosRemarcacao(
      hora_inicio,
      hora_fim,
      modal.janela,
      this.hoje,
      horaLocal(new Date().toISOString()),
    );
  });

  ngOnInit(): void {
    this.auth
      .me()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.user.set(user);
          this.talvezAbrirTour();
        },
        error: () => {
          this.auth.clearSession();
          void this.router.navigate([APP_ROUTES.login]);
        },
      });

    this.destroyRef.onDestroy(() => this.tour.encerrar());
    const publicadas = Number(this.publicadas());
    this.executar(
      of(null),
      publicadas
        ? `Agenda aberta em ${plural(publicadas, 'dia', 'dias')}. O aviso por e-mail vai para os incubados.`
        : '',
    );
    if (publicadas) {
      // Recarregar a página não deve repetir o aviso.
      void this.router.navigate([], { queryParams: { publicadas: null }, replaceUrl: true });
    }
  }

  protected abrirTour(): void {
    this.tour.iniciar(TOUR);
  }

  /**
   * O tour abre sozinho só na primeira visita, e só quando a tela já está
   * desenhada: o template depende da sessão, e o último passo, da agenda.
   */
  private talvezAbrirTour(): void {
    if (this.tourConferido || !this.user() || this.carregando()) {
      return;
    }
    this.tourConferido = true;
    afterNextRender(() => this.tour.iniciarNaPrimeiraVisita('meus-horarios-lista', TOUR), {
      injector: this.injector,
    });
  }

  // --- ações sobre a agenda publicada ---

  protected trocarFiltro(filtro: Filtro): void {
    this.filtro.set(filtro);
    this.aberto.set('');
  }

  protected alternar(data: string): void {
    this.aberto.set(this.aberto() === data ? '' : data);
  }

  protected abrirEdicao(janela: Janela): void {
    this.formJanela.setValue({
      hora_inicio: hhmm(janela.hora_inicio),
      hora_fim: hhmm(janela.hora_fim),
      duracao_minutos: janela.duracao_minutos,
    });
    this.abrirModal({ tipo: 'editar', janela });
  }

  protected abrirCancelarJanela(janela: Janela): void {
    const reservas = janela.horarios.filter((horario) => horario.incubado_email).length;
    this.abrirModal({ tipo: 'cancelar-janela', janela, reservas });
  }

  protected abrirCancelarDia(dia: {
    data: string;
    rotulo: string;
    janelas: number;
    reservas: number;
  }): void {
    this.abrirModal({ tipo: 'cancelar-dia', ...dia });
  }

  protected abrirRemarcar(horario: Horario, janela: Janela): void {
    this.formHorario.setValue({
      hora_inicio: horaLocal(horario.inicio),
      hora_fim: horaLocal(horario.fim),
    });
    this.abrirModal({ tipo: 'remarcar', horario, janela, incubado: horario.incubado_email ?? '' });
  }

  protected abrirTirarHorario(horario: Horario, rotulo: string): void {
    this.abrirModal({
      tipo: 'tirar-horario',
      horario,
      rotulo,
      incubado: horario.incubado_email ?? '',
    });
  }

  protected fecharModal(): void {
    this.modal.set(null);
    this.erroModal.set('');
  }

  protected confirmarModal(): void {
    const modal = this.modal();
    if (!modal || this.salvando()) {
      return;
    }
    switch (modal.tipo) {
      case 'editar': {
        const erros = this.errosEdicao();
        if (erros.inicio || erros.fim || erros.duracao) {
          return;
        }
        const valor = this.formJanela.getRawValue();
        this.executar(
          this.service.editarJanela(modal.janela.id, {
            ...valor,
            duracao_minutos: Number(valor.duracao_minutos),
          }),
          'Faixa atualizada.',
        );
        return;
      }
      case 'cancelar-janela':
        this.executar(
          this.service.cancelarJanela(modal.janela.id),
          this.textoCancelamento('Faixa cancelada', modal.reservas),
        );
        return;
      case 'cancelar-dia':
        this.executar(
          this.service.cancelarDias([modal.data]),
          this.textoCancelamento('Dia cancelado', modal.reservas),
        );
        return;
      case 'tirar-horario':
        this.executar(
          this.service.tirarHorario(modal.horario.id),
          modal.incubado
            ? `Horário tirado. A reserva de ${modal.incubado} foi cancelada, com aviso por e-mail.`
            : 'Horário tirado da agenda.',
          undefined,
          // Hoje o backend responde 500 aqui (divergência 10 do CLAUDE.md):
          // "tente novamente" não resolve, então a tela diz o que dá para fazer.
          (err) =>
            err.code === 'UNKNOWN'
              ? 'O servidor ainda não consegue tirar um horário avulso — erro conhecido, já reportado. Por enquanto, edite ou cancele a faixa inteira.'
              : err.message,
        );
        return;
      case 'remarcar': {
        const erros = this.errosRemarcar();
        if (erros.inicio || erros.fim) {
          return;
        }
        this.executar(
          this.service.remarcarHorario(modal.horario.id, this.formHorario.getRawValue()),
          `Consultoria remarcada. O aviso por e-mail vai para ${modal.incubado}.`,
        );
        return;
      }
    }
  }

  // --- infraestrutura ---

  private abrirModal(modal: Modal): void {
    this.erroModal.set('');
    this.modal.set(modal);
  }

  private textoCancelamento(inicio: string, reservas: number): string {
    return reservas
      ? `${inicio}. ${plural(reservas, 'reserva cancelada', 'reservas canceladas')}, com aviso por e-mail.`
      : `${inicio}.`;
  }

  /**
   * Toda escrita relê a agenda depois: editar recria os horários livres com ids
   * novos, e cancelar apaga linhas. Erro com modal aberta fica na modal.
   */
  private executar(
    acao: Observable<unknown>,
    sucesso: string,
    depois?: () => void,
    mensagemDoErro: (err: ApiError) => string = (err) => err.message,
  ): void {
    this.salvando.set(true);
    this.mensagemErro.set('');
    this.mensagemSucesso.set('');
    this.erroModal.set('');
    acao
      .pipe(
        switchMap(() => this.service.minhaAgenda()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (janelas) => {
          this.janelas.set(janelas);
          this.carregando.set(false);
          this.salvando.set(false);
          this.modal.set(null);
          this.mensagemSucesso.set(sucesso);
          depois?.();
          this.talvezAbrirTour();
        },
        error: (err: ApiError) => {
          this.carregando.set(false);
          this.salvando.set(false);
          if (this.modal()) {
            this.erroModal.set(mensagemDoErro(err));
          } else {
            this.mensagemErro.set(mensagemDoErro(err));
          }
        },
      });
  }
}
