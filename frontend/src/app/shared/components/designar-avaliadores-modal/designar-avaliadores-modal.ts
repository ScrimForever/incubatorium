import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, forkJoin } from 'rxjs';

import { ApiError } from '../../../core/models/auth';
import { Avaliador } from '../../../core/models/avaliador';
import { Questionario, ROTULO_STATUS } from '../../../core/models/questionario';
import { PlanosService } from '../../../core/services/planos';
import { Icone } from '../icone/icone';

type Modo = 'selecionar' | 'automatico';
type Regra = 'sorteio' | 'fila';

const MODOS: readonly { valor: Modo; rotulo: string }[] = [
  { valor: 'selecionar', rotulo: 'Selecionar' },
  { valor: 'automatico', rotulo: 'Automático' },
];

const REGRAS: readonly { valor: Regra; rotulo: string; texto: string }[] = [
  {
    valor: 'sorteio',
    rotulo: 'Sorteio',
    texto: 'O sistema sorteia entre os avaliadores disponíveis.',
  },
  {
    valor: 'fila',
    rotulo: 'Fila',
    texto: 'Rotação diária entre os avaliadores (o primeiro da fila hoje é o último amanhã).',
  },
];

/**
 * A coordenação envia o plano para avaliação: escolhe os avaliadores e aprova.
 * Não existe recusa — o admin só manda o plano para quem avalia.
 * Abre por cima da lista de planos (quem a usa só a cria quando abre) e só a
 * coordenação a vê. `concluido` avisa a lista para recarregar.
 */
@Component({
  selector: 'app-designar-avaliadores-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icone],
  templateUrl: './designar-avaliadores-modal.html',
  styleUrl: './designar-avaliadores-modal.scss',
})
export class DesignarAvaliadoresModal implements OnInit {
  private readonly planos = inject(PlanosService);
  private readonly destroyRef = inject(DestroyRef);

  readonly email = input.required<string>();
  readonly fechar = output<void>();
  readonly concluido = output<void>();

  protected readonly modos = MODOS;
  protected readonly regras = REGRAS;

  protected readonly plano = signal<Questionario | null>(null);
  protected readonly todos = signal<Avaliador[]>([]);
  protected readonly carregando = signal(true);
  protected readonly enviando = signal(false);
  protected readonly mensagemErro = signal('');

  protected readonly modo = signal<Modo>('selecionar');
  private readonly marcados = signal<string[]>([]);
  protected readonly regra = signal<Regra>('sorteio');
  protected readonly quantidade = signal(1);

  protected readonly negocio = computed(
    () => this.plano()?.json_questionario?.['1']?.nome_negocio || 'Negócio sem nome',
  );
  protected readonly proponente = computed(
    () => this.plano()?.json_questionario?.['1']?.nome_proponente || 'Proponente não informado',
  );
  protected readonly status = computed(() => this.plano()?.status_questionario ?? 'iniciado');
  protected readonly rotuloStatus = computed(() => ROTULO_STATUS[this.status()]);
  protected readonly quando = computed(() =>
    dataLegivel(this.plano()?.atualizado_em ?? this.plano()?.criado_em),
  );
  /** Só um plano aguardando aprovação é enviado para avaliação. */
  protected readonly emAnalise = computed(() => this.status() === 'aguardando_aprovacao');

  protected readonly escolhidos = computed(() =>
    this.marcados()
      .map((email) => this.todos().find((a) => a.email === email))
      .filter((a): a is Avaliador => !!a),
  );
  protected readonly disponiveis = computed(() =>
    this.todos().filter((a) => !this.marcados().includes(a.email)),
  );

  /** Nunca pede mais avaliadores do que existem. */
  protected readonly quantidadeEfetiva = computed(() =>
    Math.min(this.quantidade(), this.todos().length),
  );

  /** Uma bolinha por avaliador: a n-ésima escolhe n. */
  protected readonly bolinhas = computed(() => this.todos().map((_, i) => i + 1));

  /** Com todas as bolinhas pintadas entram todos os avaliadores e a regra deixa de valer. */
  protected readonly todosEscolhidos = computed(
    () => this.todos().length > 0 && this.quantidadeEfetiva() === this.todos().length,
  );

  protected readonly resumo = computed(() => {
    const n = this.modo() === 'automatico' ? this.quantidadeEfetiva() : this.marcados().length;
    return n === 0
      ? 'Nenhum avaliador escolhido'
      : n === 1
        ? '1 avaliador escolhido'
        : `${n} avaliadores escolhidos`;
  });
  protected readonly podeAprovar = computed(
    () =>
      !this.enviando() &&
      (this.modo() === 'automatico' ? this.todos().length > 0 : this.marcados().length > 0),
  );

  private readonly dialogo = viewChild<ElementRef<HTMLElement>>('dialogo');
  private readonly ultimoFoco = document.activeElement as HTMLElement | null;

  constructor() {
    // Abrir move o foco para a modal; fechar devolve para o botão que a abriu.
    effect(() => this.dialogo()?.nativeElement.focus());
    this.destroyRef.onDestroy(() => {
      if (this.ultimoFoco?.isConnected) {
        this.ultimoFoco.focus();
      }
    });
  }

  ngOnInit(): void {
    forkJoin([this.planos.plano(this.email()), this.planos.avaliadores()])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ([plano, avaliadores]) => {
          this.plano.set(plano);
          this.todos.set(avaliadores);
          this.carregando.set(false);
        },
        error: (err: ApiError) => {
          this.carregando.set(false);
          this.mensagemErro.set(err.message);
        },
      });
  }

  protected trocarModo(modo: Modo): void {
    if (modo === this.modo()) {
      return;
    }
    // Cada modo começa do zero: nada do que foi feito no outro vale aqui.
    this.marcados.set([]);
    this.regra.set('sorteio');
    this.quantidade.set(1);
    this.modo.set(modo);
  }

  protected trocarRegra(regra: Regra): void {
    this.regra.set(regra);
  }

  protected trocarQuantidade(quantidade: number): void {
    this.quantidade.set(quantidade);
  }

  protected escolher(email: string): void {
    // Clique duplo não escolhe a mesma pessoa duas vezes.
    this.marcados.update((lista) => (lista.includes(email) ? lista : [...lista, email]));
  }

  protected tirar(email: string): void {
    this.marcados.update((lista) => lista.filter((item) => item !== email));
  }

  /**
   * Avaliadores à espera da confirmação; nulo = ainda escolhendo. O sorteio do
   * automático roda aqui, uma vez só, para a confirmação mostrar exatamente
   * quem vai receber o plano.
   */
  protected readonly paraConfirmar = signal<Avaliador[] | null>(null);

  protected aprovar(): void {
    if (!this.podeAprovar()) {
      return;
    }
    // Automático: a regra roda aqui, no navegador, até o backend assumi-la
    // (`docs/contrato-designacao.md`).
    const emails =
      this.modo() === 'automatico'
        ? this.escolhaAutomatica()
        : this.escolhidos().map((a) => a.email);
    this.mensagemErro.set('');
    this.paraConfirmar.set(this.todos().filter((a) => emails.includes(a.email)));
  }

  protected voltarDaConfirmacao(): void {
    this.paraConfirmar.set(null);
  }

  protected confirmarEnvio(): void {
    const avaliadores = this.paraConfirmar();
    if (!avaliadores?.length || this.enviando()) {
      return;
    }
    this.enviar(
      this.planos.aprovarComAvaliadores(
        this.email(),
        avaliadores.map((a) => a.email),
      ),
    );
  }

  /** Esc volta da confirmação antes de fechar a modal. */
  protected escape(): void {
    if (this.enviando()) {
      return;
    }
    if (this.paraConfirmar()) {
      this.voltarDaConfirmacao();
    } else {
      this.fechar.emit();
    }
  }

  /** Prende o Tab dentro da modal. O `shift` vem do template. */
  protected prenderTab(evento: Event, shift: boolean, dialogo: HTMLElement): void {
    const focaveis = Array.from(
      dialogo.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focaveis.length === 0) {
      return;
    }
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    const ativo = document.activeElement;

    if (shift && (ativo === primeiro || ativo === dialogo)) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!shift && ativo === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  private escolhaAutomatica(): string[] {
    if (this.todosEscolhidos()) {
      return this.todos().map((a) => a.email);
    }
    const lista = [...this.todos()];
    if (this.regra() === 'fila') {
      // Fila: rotação diária. A seed é a data de hoje (YYYY-MM-DD).
      // Assim a mesma data sempre produz a mesma ordem, mudando a cada dia.
      const hoje = new Date().toISOString().split('T')[0];
      const seed = this.simpleHash(hoje);
      this.embaralhaSeed(lista, seed);
    } else {
      // Sorteio: aleatório puro.
      this.embaralha(lista);
    }
    return lista.slice(0, this.quantidadeEfetiva()).map((a) => a.email);
  }

  /** Embaralha in-place com Fisher-Yates puro (sem seed). */
  private embaralha(lista: Avaliador[]): void {
    for (let i = lista.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lista[i], lista[j]] = [lista[j], lista[i]];
    }
  }

  /** Embaralha in-place com Fisher-Yates seeded. */
  private embaralhaSeed(lista: Avaliador[], seed: number): void {
    const prng = this.seedRandom(seed);
    for (let i = lista.length - 1; i > 0; i--) {
      const j = Math.floor(prng() * (i + 1));
      [lista[i], lista[j]] = [lista[j], lista[i]];
    }
  }

  /** Hash simples de string para number. */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 32-bit int
    }
    return Math.abs(hash);
  }

  /** Seeded PRNG simples (linear congruential). */
  private seedRandom(seed: number): () => number {
    const a = 1664525;
    const c = 1013904223;
    const m = 2 ** 32;
    let x = seed;
    return () => {
      x = (a * x + c) % m;
      return x / m;
    };
  }

  private enviar(chamada: Observable<Questionario>): void {
    this.enviando.set(true);
    this.mensagemErro.set('');
    chamada.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.concluido.emit(),
      error: (err: ApiError) => {
        this.enviando.set(false);
        this.mensagemErro.set(err.message);
      },
    });
  }
}

/** Data curta, em PT-BR; sem data, um traço — o mesmo da lista de planos. */
function dataLegivel(iso?: string | null): string {
  if (!iso) {
    return '—';
  }
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleDateString('pt-BR');
}
