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
import { Observable, forkJoin, of, switchMap } from 'rxjs';

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
  rotuloDataCurto,
} from '../../core/services/consultorias';
import { DiaDaFaixa, FaixaDias } from '../../shared/components/faixa-dias/faixa-dias';
import { Icone } from '../../shared/components/icone/icone';
import { Painel } from '../../shared/components/painel/painel';

/** Um horário como o template mostra. */
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

/** Lista (faixa de dias) ou calendário do mês; a escolha fica só neste navegador. */
type Visao = 'lista' | 'calendario';
const CHAVE_VISAO = 'agendar-consultoria:visao';
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

function visaoGuardada(): Visao {
  try {
    return localStorage.getItem(CHAVE_VISAO) === 'calendario' ? 'calendario' : 'lista';
  } catch {
    return 'lista';
  }
}

/**
 * Consultorias do incubado: as reservas dele e os horários livres para
 * reservar. Reservar é direto — sem aceite do consultor —, como a API faz.
 */
@Component({
  selector: 'app-agendar-consultoria',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, Painel, Icone, FaixaDias],
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

  private readonly livres = signal<Horario[]>([]);
  private readonly reservas = signal<Horario[]>([]);

  protected readonly filtro = signal(TODOS);
  protected readonly todos = TODOS;
  /** O mês escolhido nas abas (AAAA-MM); vazio = o primeiro das abas com vaga. */
  protected readonly mes = signal('');

  protected readonly minhas = computed(() => this.reservas().map(vagaDe));

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
      const [semana, numero] = rotuloDataCurto(data).split(' ');
      return {
        data,
        rotulo: rotuloData(data),
        semana,
        numero: numero.slice(0, 2),
        vagas,
        // Antes do meio-dia é manhã; o resto, tarde — o corte da visão em lista.
        manha: vagas.filter((vaga) => vaga.hora < '12:00'),
        tarde: vagas.filter((vaga) => vaga.hora >= '12:00'),
      };
    });
  });

  // --- visões: lista (faixa de dias) e calendário ---

  protected readonly visao = signal<Visao>(visaoGuardada());
  /** O dia aberto; vazio = o primeiro com vaga no mês. */
  protected readonly diaEscolhido = signal('');
  protected readonly diaAtual = computed(
    () => this.dias().find((dia) => dia.data === this.diaEscolhido()) ?? this.dias()[0],
  );

  protected readonly faixa = computed(() =>
    this.dias().map((dia): DiaDaFaixa => ({
      data: dia.data,
      rotulo: `${dia.rotulo}, ${dia.vagas.length} livres`,
      semana: dia.semana,
      numero: dia.numero,
      detalhe: `${dia.vagas.length} livres`,
    })),
  );

  protected readonly tituloCalendario = computed(() => {
    const [ano, mes] = this.mesAtivo().split('-').map(Number);
    return `${MESES[mes - 1]} de ${ano}`;
  });
  protected readonly cabecalhoSemana = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  protected readonly casasCalendario = computed(() => {
    const [ano, mes] = this.mesAtivo().split('-').map(Number);
    const porData = new Map(this.dias().map((dia) => [dia.data, dia]));
    const vazias = (new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay() + 6) % 7;
    const total = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const casas: { data: string; numero: number; livres: number }[] = Array.from(
      { length: vazias },
      () => ({ data: '', numero: 0, livres: 0 }),
    );
    for (let numero = 1; numero <= total; numero++) {
      const data = `${this.mesAtivo()}-${String(numero).padStart(2, '0')}`;
      casas.push({ data, numero, livres: porData.get(data)?.vagas.length ?? 0 });
    }
    return casas;
  });
  protected readonly totalLivres = computed(() => this.livres().length);

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

    this.executar(of(null), '');
  }

  protected trocarVisao(visao: Visao): void {
    this.visao.set(visao);
    try {
      localStorage.setItem(CHAVE_VISAO, visao);
    } catch {
      // Sem armazenamento, a escolha vale só nesta visita.
    }
  }

  protected trocarMes(mes: string): void {
    this.mes.set(mes);
    this.diaEscolhido.set('');
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
    this.executar(
      this.service.reservar(vaga.horario.id),
      `Consultoria reservada: ${vaga.dia}, ${vaga.hora}, com ${vaga.consultor}.`,
    );
  }

  /** Só atualiza as listas, sem mexer em mensagem nem na confirmação aberta. */
  private reler(): void {
    forkJoin({ minhas: this.service.minhas(), livres: this.service.livres() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ minhas, livres }) => {
        this.reservas.set(minhas);
        this.livres.set(livres);
      });
  }

  /**
   * Relê reservas e livres depois de toda escrita: o horário reservado sai de
   * uma lista e entra na outra. Erro com a confirmação aberta fica nela.
   */
  private executar(acao: Observable<unknown>, sucesso: string): void {
    this.salvando.set(true);
    this.mensagemErro.set('');
    this.mensagemSucesso.set('');
    this.erroModal.set('');
    acao
      .pipe(
        switchMap(() => forkJoin({ minhas: this.service.minhas(), livres: this.service.livres() })),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ minhas, livres }) => {
          this.reservas.set(minhas);
          this.livres.set(livres);
          this.carregando.set(false);
          this.salvando.set(false);
          this.escolhida.set(null);
          this.mensagemSucesso.set(sucesso);
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
