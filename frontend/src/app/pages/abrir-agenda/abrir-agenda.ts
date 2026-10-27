import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { APP_ROUTES } from '../../core/constants/app-constants';
import { ApiError, SessionUser } from '../../core/models/auth';
import { Bloco, Janela } from '../../core/models/consultoria';
import { Auth } from '../../core/services/auth';
import {
  ConsultoriasService,
  DIAS_SEMANA,
  conflitoComAgenda,
  datasDoPeriodo,
  erroDoPeriodo,
  errosDaFaixa,
  faixasSemTirados,
  fatiar,
  hojeLocal,
  horaLocal,
  rotuloData,
  rotuloDataCurto,
  sobreposicoes,
} from '../../core/services/consultorias';
import { PassoTour, TourService } from '../../core/services/tour';
import { CalendarioPeriodo } from '../../shared/components/calendario-periodo/calendario-periodo';
import { Icone } from '../../shared/components/icone/icone';
import { Painel } from '../../shared/components/painel/painel';

/** O tour da tela: o alvo é o `data-tour` do template. */
const TOUR: readonly PassoTour[] = [
  {
    alvo: 'calendario',
    titulo: '1. Escolha as datas',
    texto:
      'Clique num dia para uma data só. Para um <b>período</b>, clique no primeiro e no último dia. Os dias com ponto verde já têm agenda ou já estão na lista.',
  },
  {
    alvo: 'selecao',
    titulo: 'Filtre o período',
    texto:
      'Num período, marque os <b>dias da semana</b> em que você atende. O botão mostra quantas datas vão entrar.',
  },
  {
    alvo: 'datas',
    titulo: 'Confira as datas',
    texto: 'Estas datas recebem os horários. Passe o mouse numa delas para tirá-la pelo ×.',
  },
  {
    alvo: 'faixa',
    titulo: '2. Defina as faixas',
    texto:
      'Informe início, fim e a <b>duração</b> de cada consultoria. A prévia mostra os horários que serão criados; passe o mouse num deles para tirar pelo ×.',
  },
  {
    alvo: 'publicar',
    titulo: 'Publique',
    texto:
      'Se algo estiver errado, o motivo aparece ao lado do botão. Ao publicar, você volta para a lista e os incubados recebem um aviso por e-mail.',
  },
];

const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;

/**
 * Abrir agenda: escolhe datas (uma ou um período) e faixas, valida tudo antes e
 * publica de uma vez. Ao publicar, volta para Meus horários com o aviso.
 */
@Component({
  selector: 'app-abrir-agenda',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, CalendarioPeriodo, Painel, Icone],
  templateUrl: './abrir-agenda.html',
  styleUrl: './abrir-agenda.scss',
})
export class AbrirAgenda implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly service = inject(ConsultoriasService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly tour = inject(TourService);

  protected readonly user = signal<SessionUser | null>(null);
  protected readonly salvando = signal(false);
  protected readonly mensagemErro = signal('');
  protected readonly voltar = APP_ROUTES.meusHorarios;
  protected readonly hoje = hojeLocal();

  /**
   * A agenda que já existe: o calendário marca os dias com o ponto verde, e a
   * tela avisa antes de publicar uma faixa que se sobreponha a ela.
   */
  private readonly publicadas = signal<Janela[]>([]);
  protected readonly datas = signal<string[]>([]);
  protected readonly marcadas = computed(() => [
    ...new Set([...this.publicadas().map((janela) => janela.data), ...this.datas()]),
  ]);

  /**
   * O que está escolhido no calendário: só `de` é uma data; com `ate`, um
   * período, que os dias da semana filtram.
   */
  protected readonly de = signal('');
  protected readonly ate = signal('');
  private readonly periodoValor = computed(() => ({ de: this.de(), ate: this.ate() }));
  protected readonly diasSemana = DIAS_SEMANA;
  /** Segunda a sexta marcados de saída: é o expediente da incubadora. */
  protected readonly diasMarcados = signal<number[]>([1, 2, 3, 4, 5]);
  /** O erro do período só aparece depois da primeira tentativa de adicionar. */
  private readonly tentouPeriodo = signal(false);

  protected readonly ehPeriodo = computed(() => {
    const { de, ate } = this.periodoValor();
    return !!de && !!ate && ate !== de;
  });

  protected readonly erroPeriodo = computed(() => {
    const { de, ate } = this.periodoValor();
    const erro = erroDoPeriodo(de, ate, this.diasMarcados(), this.hoje);
    // "Escolha a data inicial" só depois de tentar; o resto, assim que aparece.
    return !de && !this.tentouPeriodo() ? '' : erro;
  });

  /** As datas que o período adicionaria, ainda fora da lista. */
  protected readonly novasDoPeriodo = computed(() => {
    const { de, ate } = this.periodoValor();
    if (erroDoPeriodo(de, ate, this.diasMarcados(), this.hoje)) {
      return [];
    }
    const ja = new Set(this.datas());
    return datasDoPeriodo(de, ate, this.diasMarcados()).filter((data) => !ja.has(data));
  });

  protected readonly rotuloAdicionar = computed(() => {
    const novas = this.novasDoPeriodo().length;
    return novas > 1 ? `Adicionar ${novas} datas` : 'Adicionar data';
  });

  /** O que está escolhido, por extenso, ao lado do calendário. */
  protected readonly escolhido = computed(() => {
    const { de, ate } = this.periodoValor();
    if (!de) {
      return 'Clique num dia, ou no primeiro e no último de um período.';
    }
    if (!this.ehPeriodo()) {
      return rotuloData(de);
    }
    return `De ${rotuloData(de)} a ${rotuloData(ate)}`;
  });

  protected readonly blocos = this.fb.array([this.novoBloco('09:00', '12:00', 45)]);
  private readonly blocosValor = toSignal(this.blocos.valueChanges, {
    initialValue: this.blocos.getRawValue(),
  });

  /** Hora atual quando hoje está entre as datas: o início de hoje não pode ter passado. */
  private readonly agoraHoje = computed(() =>
    this.datas().includes(this.hoje) ? horaLocal(new Date().toISOString()) : '',
  );

  /** Erros de cada faixa, campo a campo, mais a sobreposição com outra faixa. */
  protected readonly errosFaixas = computed(() => {
    const faixas = this.blocosValor();
    const sobre = sobreposicoes(faixas);
    return faixas.map((faixa, i) => ({
      ...errosDaFaixa(faixa, this.agoraHoje()),
      sobreposicao: sobre[i] ? `Esta faixa se sobrepõe à faixa ${sobre[i]}.` : '',
    }));
  });

  /**
   * Horários tirados da prévia, por faixa (a chave é o próprio FormGroup, que não
   * muda de índice quando outra faixa sai). Ao publicar, a faixa vai partida.
   */
  private readonly tirados = signal(new Map<object, string[]>());

  /** A prévia de cada faixa válida: o que vai ser criado e quantos foram tirados. */
  protected readonly previa = computed(() =>
    this.blocosValor().map((bloco, i) => {
      const erros = this.errosFaixas()[i];
      const invalida = !!(erros.inicio || erros.fim || erros.duracao || erros.sobreposicao);
      const todos = invalida
        ? []
        : fatiar(bloco.hora_inicio ?? '', bloco.hora_fim ?? '', Number(bloco.duracao_minutos));
      const fora = this.tirados().get(this.blocos.at(i)) ?? [];
      const inicios = todos.filter((inicio) => !fora.includes(inicio));
      return { valida: !invalida, inicios, tirados: todos.length - inicios.length };
    }),
  );

  /** Datas da lista que passaram com a tela aberta (de um dia para o outro). */
  private readonly datasVencidas = computed(() => this.datas().filter((data) => data < this.hoje));

  /** O primeiro motivo que segura o "Publicar", dito ao lado do botão. */
  protected readonly pendencia = computed(() => {
    if (!this.datas().length) {
      return 'Adicione ao menos uma data.';
    }
    if (this.datasVencidas().length) {
      return 'Há data que já passou na lista: tire-a.';
    }
    const ruim = this.errosFaixas().findIndex(
      (e) => e.inicio || e.fim || e.duracao || e.sobreposicao,
    );
    if (ruim >= 0) {
      return `Corrija a faixa ${ruim + 1}.`;
    }
    const vazia = this.previa().findIndex((faixa) => faixa.valida && !faixa.inicios.length);
    if (vazia >= 0) {
      return `A faixa ${vazia + 1} ficou sem horário: restaure algum ou tire a faixa.`;
    }
    return conflitoComAgenda(this.datas(), this.blocosValor(), this.publicadas());
  });

  protected readonly rotulosDatas = computed(() =>
    this.datas().map((data) => ({
      data,
      curto: rotuloDataCurto(data),
      rotulo: rotuloData(data),
    })),
  );

  protected readonly resumoPrevia = computed(() => {
    const porDia = this.previa().reduce((soma, faixa) => soma + faixa.inicios.length, 0);
    const dias = this.datas().length;
    return `${plural(porDia * dias, 'horário', 'horários')} em ${plural(dias, 'dia', 'dias')}.`;
  });

  protected readonly podePublicar = computed(() => !this.pendencia() && !this.salvando());

  ngOnInit(): void {
    this.auth
      .me()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.user.set(user);
          // O tour espera a tela desenhada: o template depende da sessão.
          afterNextRender(() => this.tour.iniciarNaPrimeiraVisita('abrir-agenda', TOUR), {
            injector: this.injector,
          });
        },
        error: () => {
          this.auth.clearSession();
          void this.router.navigate([APP_ROUTES.login]);
        },
      });

    // Para marcar o calendário e avisar sobreposição: falhar não impede abrir (o servidor confere).
    this.service
      .minhaAgenda()
      .pipe(
        catchError(() => of([] as Janela[])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((janelas) => this.publicadas.set(janelas));

    this.destroyRef.onDestroy(() => this.tour.encerrar());
  }

  protected abrirTour(): void {
    this.tour.iniciar(TOUR);
  }

  // --- datas ---

  protected adicionarDatas(): void {
    this.tentouPeriodo.set(true);
    if (this.erroPeriodo()) {
      return;
    }
    this.datas.set([...this.datas(), ...this.novasDoPeriodo()].sort());
    this.de.set('');
    this.ate.set('');
    this.tentouPeriodo.set(false);
  }

  protected alternarDia(dia: number): void {
    const marcados = this.diasMarcados();
    this.diasMarcados.set(
      marcados.includes(dia) ? marcados.filter((d) => d !== dia) : [...marcados, dia],
    );
  }

  protected limparDatas(): void {
    this.datas.set([]);
  }

  protected tirarData(data: string): void {
    this.datas.set(this.datas().filter((outra) => outra !== data));
  }

  // --- faixas ---

  protected adicionarBloco(): void {
    this.blocos.push(this.novoBloco('14:00', '17:00', 45));
  }

  protected tirarBloco(indice: number): void {
    this.blocos.removeAt(indice);
  }

  protected tirarDaPrevia(indice: number, inicio: string): void {
    const chave = this.blocos.at(indice);
    const mapa = new Map(this.tirados());
    mapa.set(chave, [...(mapa.get(chave) ?? []), inicio]);
    this.tirados.set(mapa);
  }

  protected restaurarPrevia(indice: number): void {
    const mapa = new Map(this.tirados());
    mapa.delete(this.blocos.at(indice));
    this.tirados.set(mapa);
  }

  // --- publicar ---

  protected publicar(): void {
    if (!this.podePublicar()) {
      return;
    }
    const blocos: Bloco[] = this.blocos.controls.flatMap((controle) => {
      const bloco = controle.getRawValue();
      return faixasSemTirados(
        { ...bloco, duracao_minutos: Number(bloco.duracao_minutos) },
        this.tirados().get(controle) ?? [],
      );
    });
    const dias = this.datas().length;
    this.salvando.set(true);
    this.mensagemErro.set('');
    this.service
      .abrirAgenda({ datas: this.datas(), blocos })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // A lista mostra o aviso a partir do `?publicadas=` e o tira da URL.
        next: () =>
          void this.router.navigate([APP_ROUTES.meusHorarios], {
            queryParams: { publicadas: dias },
          }),
        error: (err: ApiError) => {
          this.salvando.set(false);
          this.mensagemErro.set(err.message);
        },
      });
  }

  private novoBloco(inicio: string, fim: string, duracao: number) {
    // As regras moram em `errosDaFaixa`, que conhece a faixa inteira.
    return this.fb.nonNullable.group({
      hora_inicio: inicio,
      hora_fim: fim,
      duracao_minutos: duracao,
    });
  }
}
