import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable, catchError, map, of, switchMap } from 'rxjs';

import { APP_ROUTES } from '../../core/constants/app-constants';
import { ApiError, SessionUser } from '../../core/models/auth';
import { PlanoResumo } from '../../core/models/plano';
import { Auth } from '../../core/services/auth';
import {
  ConsultoriaMarcada,
  ConsultoriasService,
  consultoriasMarcadas,
  errosRemarcacao,
  hojeLocal,
  horaLocal,
  rotuloData,
} from '../../core/services/consultorias';
import { PlanosService } from '../../core/services/planos';
import { Icone } from '../../shared/components/icone/icone';
import { Painel } from '../../shared/components/painel/painel';
import { formatarQuando } from '../../shared/data-hora';

/** Uma linha da lista, com tudo o que o template mostra já resolvido. */
interface Linha {
  readonly id: number;
  readonly marcada: ConsultoriaMarcada;
  readonly negocio: string;
  readonly proponente: string;
  readonly email: string;
  readonly dia: string;
  readonly hora: string;
  readonly faixa: string;
  readonly reservadoEm: string;
  readonly planoRota: string;
}

/**
 * O que o legado tinha e a API ainda não entrega. Fica à vista, cadeado e com o
 * motivo, em vez de sumir — regra do CLAUDE.md para módulo sem endpoint.
 */
const BLOQUEADOS: readonly { rotulo: string; motivo: string }[] = [
  { rotulo: 'Conversa', motivo: 'a API não tem chat de consultoria' },
  { rotulo: 'Anexos', motivo: 'a API não guarda arquivos da consultoria' },
  { rotulo: 'Videochamada', motivo: 'a API não tem link de chamada' },
  { rotulo: 'Marcar como realizada', motivo: 'a API não guarda situação da consultoria' },
];

const SITUACOES_BLOQUEADAS: readonly { rotulo: string; motivo: string }[] = [
  { rotulo: 'Realizadas', motivo: 'a API devolve só de hoje em diante' },
  { rotulo: 'Canceladas', motivo: 'a API apaga a reserva cancelada' },
];

/**
 * Consultorias marcadas do consultor (legado `appointments`). A API não tem
 * situação nem aceite: reservou é marcado. Por isso a lista é uma só — as
 * próximas, por dia — e o resto do legado entra cadeado.
 */
@Component({
  selector: 'app-consultorias',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, Painel, Icone],
  templateUrl: './consultorias.html',
  styleUrl: './consultorias.scss',
})
export class Consultorias implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly service = inject(ConsultoriasService);
  private readonly planos = inject(PlanosService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly user = signal<SessionUser | null>(null);
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly mensagemErro = signal('');
  protected readonly mensagemSucesso = signal('');
  protected readonly erroModal = signal('');

  protected readonly bloqueados = BLOQUEADOS;
  protected readonly situacoesBloqueadas = SITUACOES_BLOQUEADAS;
  protected readonly meusHorarios = APP_ROUTES.meusHorarios;

  private readonly marcadas = signal<ConsultoriaMarcada[]>([]);
  /** Nome do negócio e do proponente por e-mail, tirados dos planos. */
  private readonly nomes = signal(new Map<string, PlanoResumo>());

  protected readonly busca = this.fb.nonNullable.control('');
  private readonly termo = signal('');

  protected readonly linhas = computed<Linha[]>(() =>
    this.marcadas().map((marcada) => {
      const plano = this.nomes().get(marcada.incubado);
      const { horario, janela } = marcada;
      return {
        id: horario.id,
        marcada,
        negocio: plano?.nome_negocio || marcada.incubado,
        proponente: plano?.nome_proponente || '',
        email: marcada.incubado,
        dia: rotuloData(janela.data),
        hora: `${horaLocal(horario.inicio)} às ${horaLocal(horario.fim)}`,
        faixa: `${janela.hora_inicio.slice(0, 5)} às ${janela.hora_fim.slice(0, 5)}`,
        reservadoEm: horario.reservado_em ? formatarQuando(horario.reservado_em) : '',
        planoRota: APP_ROUTES.planoDe(marcada.incubado),
      };
    }),
  );

  /** As linhas que passam na busca, agrupadas pelo dia da janela. */
  protected readonly dias = computed(() => {
    const termo = this.termo().trim().toLowerCase();
    const visiveis = this.linhas().filter(
      (linha) =>
        !termo ||
        `${linha.negocio} ${linha.proponente} ${linha.email}`.toLowerCase().includes(termo),
    );
    const porData = new Map<string, Linha[]>();
    for (const linha of visiveis) {
      const data = linha.marcada.janela.data;
      porData.set(data, [...(porData.get(data) ?? []), linha]);
    }
    return [...porData.entries()].map(([data, linhas]) => ({
      data,
      rotulo: rotuloData(data),
      linhas,
    }));
  });

  protected readonly total = computed(() => this.linhas().length);

  // --- detalhe ---

  protected readonly abertaId = signal<number | null>(null);
  protected readonly aberta = computed(
    () => this.linhas().find((linha) => linha.id === this.abertaId()) ?? null,
  );
  protected readonly remarcando = signal(false);
  protected readonly formHorario = this.fb.nonNullable.group({ hora_inicio: '', hora_fim: '' });
  private readonly formHorarioValor = toSignal(this.formHorario.valueChanges, {
    initialValue: this.formHorario.getRawValue(),
  });

  /** Erros do remarcar: dentro da faixa e, hoje, não no passado (mesma regra de Meus horários). */
  protected readonly errosRemarcar = computed(() => {
    const linha = this.aberta();
    if (!linha || !this.remarcando()) {
      return { inicio: '', fim: '' };
    }
    const { hora_inicio = '', hora_fim = '' } = this.formHorarioValor();
    return errosRemarcacao(
      hora_inicio,
      hora_fim,
      linha.marcada.janela,
      hojeLocal(),
      horaLocal(new Date().toISOString()),
    );
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

    this.busca.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((valor) => this.termo.set(valor));

    // O nome do negócio é conforto: sem os planos, a lista mostra o e-mail.
    this.planos
      .listar()
      .pipe(
        catchError(() => of([] as PlanoResumo[])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((planos) =>
        this.nomes.set(new Map(planos.map((plano) => [plano.usuario_email, plano]))),
      );

    this.executar(of(null), '');
  }

  protected abrir(linha: Linha): void {
    this.abertaId.set(linha.id);
    this.remarcando.set(false);
    this.erroModal.set('');
  }

  protected fechar(): void {
    this.abertaId.set(null);
    this.remarcando.set(false);
    this.erroModal.set('');
  }

  protected iniciarRemarcacao(): void {
    const linha = this.aberta();
    if (!linha) {
      return;
    }
    this.formHorario.setValue({
      hora_inicio: horaLocal(linha.marcada.horario.inicio),
      hora_fim: horaLocal(linha.marcada.horario.fim),
    });
    this.erroModal.set('');
    this.remarcando.set(true);
  }

  protected remarcar(): void {
    const linha = this.aberta();
    const erros = this.errosRemarcar();
    if (!linha || erros.inicio || erros.fim || this.salvando()) {
      return;
    }
    this.executar(
      this.service.remarcarHorario(linha.id, this.formHorario.getRawValue()),
      `Consultoria remarcada. O aviso por e-mail vai para ${linha.email}.`,
    );
  }

  /** Relê a agenda depois de toda escrita; erro com o detalhe aberto fica nele. */
  private executar(acao: Observable<unknown>, sucesso: string): void {
    this.salvando.set(true);
    this.mensagemErro.set('');
    this.mensagemSucesso.set('');
    this.erroModal.set('');
    acao
      .pipe(
        switchMap(() => this.service.minhaAgenda()),
        map((janelas) => consultoriasMarcadas(janelas)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (marcadas) => {
          this.marcadas.set(marcadas);
          this.carregando.set(false);
          this.salvando.set(false);
          this.remarcando.set(false);
          this.mensagemSucesso.set(sucesso);
        },
        error: (err: ApiError) => {
          this.carregando.set(false);
          this.salvando.set(false);
          if (this.aberta()) {
            this.erroModal.set(err.message);
          } else {
            this.mensagemErro.set(err.message);
          }
        },
      });
  }
}
