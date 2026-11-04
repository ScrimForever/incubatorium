import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Observable, forkJoin, switchMap } from 'rxjs';

import { APP_ROUTES } from '../../core/constants/app-constants';
import { ApiError, SessionUser } from '../../core/models/auth';
import { Horario } from '../../core/models/consultoria';
import { Auth } from '../../core/services/auth';
import {
  ConsultoriasService,
  dataLocal,
  hojeLocal,
  horaLocal,
  porDia,
  rotuloData,
} from '../../core/services/consultorias';
import { Icone } from '../../shared/components/icone/icone';
import { Painel } from '../../shared/components/painel/painel';
import { Videochamada } from '../../shared/components/videochamada/videochamada';

/** Um horário como o template e a modal mostram. */
interface Vaga {
  readonly horario: Horario;
  readonly dia: string;
  readonly hora: string;
  readonly consultor: string;
}

/** Um horário livre como o botão de reservar mostra. */
interface VagaLivre {
  readonly horario: Horario;
  readonly hora: string;
  readonly titulo: string;
}

const vagaDe = (horario: Horario): Vaga => ({
  horario,
  dia: rotuloData(dataLocal(horario.inicio)),
  hora: `${horaLocal(horario.inicio)} às ${horaLocal(horario.fim)}`,
  consultor: horario.consultor_email,
});

/** "Todos" é o filtro sem consultor. */
const TODOS = '';

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];
/** As abas mostram o mês corrente e os dois seguintes — a janela em que se agenda. */
const MESES_NAS_ABAS = 3;

/**
 * Consultorias do incubado: calendário com horários livres para reservar.
 * Reservar é direto — sem aceite do consultor —, como a API faz.
 */
@Component({
  selector: 'app-agendar-consultoria',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, Painel, Icone, Videochamada],
  templateUrl: './agendar-consultoria.html',
  styleUrl: './agendar-consultoria.scss',
})
export class AgendarConsultoria implements OnInit {
  private readonly auth = inject(Auth);
  private readonly service = inject(ConsultoriasService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly user = signal<SessionUser | null>(null);
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly mensagemErro = signal('');
  protected readonly mensagemSucesso = signal('');
  protected readonly erroModal = signal('');
  protected readonly cancelando = signal(false);

  private readonly livres = signal<Horario[]>([]);

  /** A reserva confirmada; quando preenchido, esconde o calendário. */
  protected readonly reservada = signal<Vaga | null>(null);
  protected readonly emChamada = signal(false);

  /** Texto compacto da consultoria reservada: "quinta-feira, dia 26/11 às 18:30". */
  protected readonly reservadaRotulo = computed(() => {
    const v = this.reservada();
    if (!v) return '';
    const data = dataLocal(v.horario.inicio);
    const [ano, mes, dia] = data.split('-').map(Number);
    const semana = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(ano, mes - 1, dia, 12)),
    );
    const hora = horaLocal(v.horario.inicio);
    return `${semana}, dia ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')} às ${hora}`;
  });

  protected readonly filtro = signal(TODOS);
  protected readonly todos = TODOS;
  /** O mês escolhido nas abas (AAAA-MM); vazio = o primeiro das abas com vaga. */
  protected readonly mes = signal('');

  /** Consultores com horário livre, para o filtro — só o e-mail: é o que a API dá. */
  protected readonly consultores = computed(() =>
    [...new Set(this.livres().map((horario) => horario.consultor_email))].sort(),
  );

  /** Os livres do consultor escolhido, antes do recorte por mês. */
  private readonly doConsultor = computed(() => {
    const filtro = this.filtro();
    return this.livres().filter(
      (horario) => filtro === TODOS || horario.consultor_email === filtro,
    );
  });

  /** O mês corrente e os dois seguintes, só pelo nome: "out", "nov", "dez". */
  protected readonly meses = computed(() => {
    const [ano, mes] = hojeLocal().split('-').map(Number);
    const datas = new Set(
      this.doConsultor().map((horario) => dataLocal(horario.inicio).slice(0, 7)),
    );
    return Array.from({ length: MESES_NAS_ABAS }, (_, i) => {
      const chave = new Date(Date.UTC(ano, mes - 1 + i, 1)).toISOString().slice(0, 7);
      const numero = Number(chave.slice(5, 7));
      return {
        mes: chave,
        rotulo: MESES[numero - 1].slice(0, 3).toLowerCase(),
        temVaga: datas.has(chave),
      };
    });
  });

  /** O mês em tela: o escolhido, ou o primeiro das abas que tem vaga. */
  protected readonly mesAtivo = computed(
    () => this.mes() || (this.meses().find((aba) => aba.temVaga) ?? this.meses()[0]).mes,
  );

  protected readonly dias = computed(() => {
    const mes = this.mesAtivo();
    const visiveis = this.doConsultor().filter((horario) =>
      dataLocal(horario.inicio).startsWith(mes),
    );
    return porDia(visiveis).map(({ data, horarios }) => {
      const vagas = horarios.map((horario): VagaLivre => ({
        horario,
        hora: horaLocal(horario.inicio),
        titulo: `${horaLocal(horario.inicio)} às ${horaLocal(horario.fim)} com ${horario.consultor_email}`,
      }));
      return {
        data,
        rotulo: rotuloData(data),
        vagas,
      };
    });
  });

  /** O dia aberto; vazio = o primeiro com vaga no mês. */
  protected readonly diaEscolhido = signal('');
  protected readonly diaAtual = computed(
    () => this.dias().find((dia) => dia.data === this.diaEscolhido()) ?? this.dias()[0],
  );

  protected readonly mesTitulo = computed(() => {
    const [ano, mes] = this.mesAtivo().split('-').map(Number);
    return `${MESES[mes - 1]} de ${ano}`;
  });
  protected readonly cabecalhoSemana = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  protected readonly casasCalendario = computed(() => {
    const [ano, mes] = this.mesAtivo().split('-').map(Number);
    const hoje = hojeLocal();
    const porData = new Map(this.dias().map((dia) => [dia.data, dia]));
    const vazias = (new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay() + 6) % 7;
    const total = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const casas: {
      data: string;
      numero: number;
      livres: number;
      hoje: boolean;
      fds: boolean;
      passado: boolean;
    }[] = Array.from({ length: vazias }, () => ({
      data: '',
      numero: 0,
      livres: 0,
      hoje: false,
      fds: false,
      passado: false,
    }));
    for (let numero = 1; numero <= total; numero++) {
      const data = `${this.mesAtivo()}-${String(numero).padStart(2, '0')}`;
      const dow = new Date(Date.UTC(ano, mes - 1, numero)).getUTCDay();
      casas.push({
        data,
        numero,
        livres: porData.get(data)?.vagas.length ?? 0,
        hoje: data === hoje,
        fds: dow === 0 || dow === 6,
        passado: data < hoje,
      });
    }
    return casas;
  });
  /** O horário que o incubado escolheu e ainda não confirmou. */
  protected readonly escolhida = signal<Vaga | null>(null);

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

    forkJoin({ livres: this.service.livres(), minhas: this.service.minhas() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ livres, minhas }) => {
          this.livres.set(livres);
          this.carregando.set(false);
          const agora = new Date().toISOString();
          const reserva = minhas.find((h) => h.fim > agora);
          if (reserva) {
            this.reservada.set(vagaDe(reserva));
          }
        },
        error: (err: ApiError) => {
          this.carregando.set(false);
          this.mensagemErro.set(err.message);
        },
      });
  }

  protected trocarMes(mes: string): void {
    this.mes.set(mes);
    this.diaEscolhido.set('');
  }

  protected mudarMes(delta: number): void {
    const lista = this.meses().map((m) => m.mes);
    const idx = lista.indexOf(this.mesAtivo());
    const proximo = lista[idx + delta];
    if (proximo) this.trocarMes(proximo);
  }

  protected escolher(horario: Horario): void {
    this.erroModal.set('');
    this.escolhida.set(vagaDe(horario));
  }

  protected fechar(): void {
    this.escolhida.set(null);
    this.erroModal.set('');
  }

  protected reservar(): void {
    const vaga = this.escolhida();
    if (!vaga || this.salvando()) {
      return;
    }
    this.executar(this.service.reservar(vaga.horario.id), vaga);
  }

  /** Cancela a reserva e recomeça do zero. */
  protected cancelarReserva(): void {
    const v = this.reservada();
    if (!v || this.cancelando()) return;
    this.cancelando.set(true);
    this.mensagemErro.set('');
    this.service
      .cancelarReserva(v.horario.id)
      .pipe(
        switchMap(() => this.service.livres()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (livres) => {
          this.livres.set(livres);
          this.reservada.set(null);
          this.mensagemSucesso.set('');
          this.cancelando.set(false);
          this.diaEscolhido.set('');
        },
        error: (err: ApiError) => {
          this.cancelando.set(false);
          this.mensagemErro.set(err.message);
        },
      });
  }

  /** Relê os livres sem mexer em mensagem nem na confirmação aberta. */
  private reler(): void {
    this.service
      .livres()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((livres) => this.livres.set(livres));
  }

  /**
   * Relê os livres depois de toda escrita: o horário reservado some da grade.
   * Erro com a confirmação aberta fica nela. `vagaReservada` é definido na
   * reserva; na carga inicial é null e apenas atualiza o estado de carregamento.
   */
  private executar(acao: Observable<unknown>, vagaReservada: Vaga | null): void {
    this.salvando.set(true);
    this.mensagemErro.set('');
    this.mensagemSucesso.set('');
    this.erroModal.set('');
    acao
      .pipe(
        switchMap(() => this.service.livres()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (livres) => {
          this.livres.set(livres);
          this.carregando.set(false);
          this.salvando.set(false);
          this.escolhida.set(null);
          if (vagaReservada) {
            this.reservada.set(vagaReservada);
          }
          // O consultor filtrado pode ter ficado sem horário livre.
          if (!this.consultores().includes(this.filtro())) {
            this.filtro.set(TODOS);
          }
        },
        error: (err: ApiError) => {
          this.carregando.set(false);
          this.salvando.set(false);
          if (this.escolhida()) {
            this.erroModal.set(err.message);
            // A recusa costuma ser vaga que outro incubado levou: relê para ela sumir.
            this.reler();
          } else {
            this.mensagemErro.set(err.message);
          }
        },
      });
  }
}
