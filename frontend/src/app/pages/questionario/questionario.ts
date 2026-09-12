import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { APP_ROUTES } from '../../core/constants/app-constants';
import { destinoPara } from '../../core/guards/plano-guard';
import { ApiError, SessionUser } from '../../core/models/auth';
import {
  Anexo,
  JsonQuestionario,
  MembroEquipe,
  NUMEROS_ETAPA,
  NumeroEtapa,
  TAMANHO_MAXIMO_ANEXO,
  documentoVazio,
} from '../../core/models/questionario';
import { Auth } from '../../core/services/auth';
import {
  QuestionarioService,
  emPreenchimento,
  etapaAcessivel,
  etapaCompleta,
  etapaParaRetomar,
  lerAnexo,
  progresso,
} from '../../core/services/questionario';
import { Icone } from '../../shared/components/icone/icone';
import { TopoSessao } from '../../shared/components/topo-sessao/topo-sessao';
import { CAMPOS_ETAPA_1, ETAPAS, Etapa, ROTULO_CURTO, etapaPorNumero } from './etapas';

/** Um passo na trilha de bolinhas do topo. */
interface Passo {
  readonly numero: NumeroEtapa;
  readonly completa: boolean;
  readonly acessivel: boolean;
  readonly atual: boolean;
}

/**
 * Questionário Plano de Negócios — a primeira tela do incubado.
 *
 * Ocupa a tela inteira, sem o menu lateral: enquanto o plano não é enviado não
 * há mais nada a fazer no sistema.
 *
 * O estado é um documento só (`json_questionario`), com uma entrada por
 * aba, de "1" a "9". Toda gravação manda o documento inteiro, porque o `PUT`
 * do backend substitui o JSON em vez de fazer merge.
 */
@Component({
  selector: 'app-questionario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Icone, TopoSessao],
  templateUrl: './questionario.html',
  styleUrl: './questionario.scss',
  host: {
    '(document:keydown.escape)': 'fecharMembro()',
  },
})
export class Questionario implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly service = inject(QuestionarioService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly user = signal<SessionUser | null>(null);
  protected readonly json = signal<JsonQuestionario>(documentoVazio());
  protected readonly carregado = signal(false);
  protected readonly numero = signal<NumeroEtapa>(1);
  protected readonly salvando = signal(false);
  protected readonly enviando = signal(false);
  protected readonly mensagemErro = signal('');
  protected readonly mensagemSucesso = signal('');
  protected readonly membroAberto = signal(false);
  /**
   * Só depois de tentar avançar os campos vazios ficam vermelhos. Antes disso
   * a etapa recém-aberta apareceria toda em erro, o que assusta sem ajudar.
   * A borda por `:focus`/`blur` é do CSS e não depende deste sinal.
   */
  protected readonly tentouAvancar = signal(false);

  protected readonly form = signal<FormGroup>(this.fb.group({}));

  private readonly trilha = viewChild<ElementRef<HTMLElement>>('trilha');

  /* A trilha é uma linha só e rola na horizontal quando as nove abas não cabem
     — sem isto o passo atual ficaria fora da vista em tela estreita. */
  private readonly seguirPassoAtual = effect(() => {
    const numero = this.numero();
    const nav = this.trilha()?.nativeElement;
    nav
      ?.querySelector(`[data-passo='${numero}']`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  });

  protected readonly etapa = computed<Etapa>(() => etapaPorNumero(this.numero()));
  protected readonly camposEtapa1 = CAMPOS_ETAPA_1;
  protected readonly total = ETAPAS.length;
  protected readonly ehUltima = computed(() => this.numero() === 9);
  protected readonly ehPrimeira = computed(() => this.numero() === 1);

  protected readonly passos = computed<Passo[]>(() => {
    const json = this.json();
    return NUMEROS_ETAPA.map((numero) => ({
      numero,
      completa: etapaCompleta(json, numero),
      acessivel: etapaAcessivel(json, numero),
      atual: numero === this.numero(),
    }));
  });

  protected readonly progresso = computed(() => progresso(this.json()));

  /** Etapa 4 sem nenhum membro, depois de tentar avançar. */
  protected readonly equipeFaltando = computed(
    () => this.tentouAvancar() && this.numero() === 4 && this.membros().length === 0,
  );

  /** A etapa aberta cobra anexo e ainda não tem nenhum? (6 e 9 cobram.) */
  protected readonly anexoFaltando = computed(() => {
    if (!this.tentouAvancar()) {
      return false;
    }
    const numero = this.numero();
    if (numero === 6) {
      return this.anexosMercado().length === 0;
    }
    return numero === 9 && this.planilhas().length === 0;
  });

  protected readonly membros = computed<readonly MembroEquipe[]>(() => this.json()['4'].equipe);

  /** Anexos: um por etapa (6 e 9), embutidos no próprio JSON. */
  protected readonly anexosMercado = computed<readonly Anexo[]>(() => this.json()['6'].arquivos);
  protected readonly planilhas = computed<readonly Anexo[]>(() => this.json()['9'].arquivos);

  protected readonly formMembro = this.fb.nonNullable.group({
    nome: ['', Validators.required],
    formacao_academica: ['', Validators.required],
    experiencia: [''],
    email: ['', [Validators.required, Validators.email]],
    telefone: [''],
  });

  private readonly dialogoMembro = viewChild<ElementRef<HTMLElement>>('dialogoMembro');
  private ultimoFoco: HTMLElement | null = null;

  constructor() {
    // Abrir move o foco para a modal; fechar devolve para quem a abriu — o
    // mesmo contrato do `activation-modal`, senão `aria-modal` é promessa vazia.
    effect(() => {
      const dialogo = this.dialogoMembro();
      if (this.membroAberto() && dialogo) {
        this.ultimoFoco = document.activeElement as HTMLElement | null;
        dialogo.nativeElement.focus();
      } else if (!this.membroAberto() && this.ultimoFoco) {
        this.ultimoFoco.focus();
        this.ultimoFoco = null;
      }
    });
  }

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

    this.service
      .meu()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (plano) => {
          // Plano já enviado não volta ao formulário: cada status tem a sua tela.
          if (!emPreenchimento(plano.status_questionario)) {
            const user = this.user();
            void this.router.navigate(
              [destinoPara(plano.status_questionario, user?.role ?? 'incubado')],
              { replaceUrl: true },
            );
            return;
          }
          this.json.set(plano.json_questionario);
          this.numero.set(etapaParaRetomar(plano.json_questionario));
          this.carregado.set(true);
          this.montarFormulario();
        },
        error: (err: ApiError) => this.mensagemErro.set(err.message),
      });
  }

  /** Monta o FormGroup da etapa a partir da definição em `etapas.ts`. */
  private montarFormulario(): void {
    const aba = this.abaAtual();
    const controles: Record<string, unknown> = {};
    const validadores = (obrigatorio: boolean): unknown[] =>
      obrigatorio ? [Validators.required] : [];
    if (this.numero() === 1) {
      for (const campo of CAMPOS_ETAPA_1) {
        controles[campo.nome] = [String(aba[campo.nome] ?? ''), validadores(campo.obrigatorio)];
      }
    }
    for (const campo of this.etapa().campos) {
      controles[campo.nome] = [String(aba[campo.nome] ?? ''), validadores(campo.obrigatorio)];
    }
    this.form.set(this.fb.group(controles));
  }

  /** A aba atual como mapa solto — as chaves variam de etapa para etapa. */
  private abaAtual(): Record<string, unknown> {
    const chave = String(this.numero()) as keyof JsonQuestionario;
    return this.json()[chave] as unknown as Record<string, unknown>;
  }

  /** Mescla campos numa aba e devolve o documento inteiro, pronto para o PUT. */
  private documentoCom(numero: NumeroEtapa, campos: Record<string, unknown>): JsonQuestionario {
    const chave = String(numero) as keyof JsonQuestionario;
    const json = this.json();
    return { ...json, [chave]: { ...json[chave], ...campos } };
  }

  protected irPara(numero: NumeroEtapa): void {
    if (!this.passos().find((passo) => passo.numero === numero)?.acessivel) {
      return;
    }
    this.salvarEntao(() => {
      this.numero.set(numero);
      this.montarFormulario();
      this.tentouAvancar.set(false);
      this.mensagemSucesso.set('');
    });
  }

  protected voltar(): void {
    if (!this.ehPrimeira()) {
      this.irPara((this.numero() - 1) as NumeroEtapa);
    }
  }

  protected avancar(): void {
    // Feedback imediato, antes de esperar a gravação: os campos vazios acendem.
    this.revelarPendencias();
    if (this.ehUltima()) {
      this.enviarPlano();
      return;
    }
    this.salvarEntao(() => {
      const proxima = (this.numero() + 1) as NumeroEtapa;
      if (!this.passos().find((passo) => passo.numero === proxima)?.acessivel) {
        this.mensagemErro.set('Preencha esta etapa antes de avançar.');
        return;
      }
      this.numero.set(proxima);
      this.montarFormulario();
      this.tentouAvancar.set(false);
      this.mensagemSucesso.set('');
    });
  }

  /** Marca tudo como tocado para as legendas e as bordas aparecerem. */
  private revelarPendencias(): void {
    this.tentouAvancar.set(true);
    this.form().markAllAsTouched();
  }

  protected salvar(): void {
    this.salvarEntao(() => this.mensagemSucesso.set('Formulário salvo com sucesso!'));
  }

  /** Grava a etapa aberta e só então segue. */
  private salvarEntao(depois: () => void): void {
    if (this.salvando()) {
      return;
    }
    const valores = this.form().getRawValue() as Record<string, unknown>;
    this.gravar(this.documentoCom(this.numero(), valores), () => {
      this.form().markAsPristine();
      depois();
    });
  }

  // ----- etapa 4: equipe -----

  protected abrirMembro(): void {
    this.formMembro.reset();
    this.membroAberto.set(true);
  }

  protected fecharMembro(): void {
    if (this.membroAberto()) {
      this.membroAberto.set(false);
    }
  }

  /** Prende o Tab dentro da modal. O `shift` vem do template, como no padrão. */
  protected onTabMembro(evento: Event, shift: boolean): void {
    const dialogo = this.dialogoMembro()?.nativeElement;
    if (!dialogo) {
      return;
    }
    const focaveis = Array.from(
      dialogo.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
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

  protected adicionarMembro(): void {
    if (this.formMembro.invalid) {
      this.formMembro.markAllAsTouched();
      return;
    }
    const membro: MembroEquipe = { id: `m-${Date.now()}`, ...this.formMembro.getRawValue() };
    this.gravar(this.documentoCom(4, { equipe: [...this.membros(), membro] }));
    this.membroAberto.set(false);
  }

  protected removerMembro(id: string): void {
    const equipe = this.membros().filter((membro) => membro.id !== id);
    this.gravar(this.documentoCom(4, { equipe }));
  }

  // ----- anexos -----

  /**
   * O arquivo vai embutido no JSON, em base64 — não existe rota de upload no
   * backend. Daí o teto por arquivo: o documento inteiro sobe de novo a cada
   * gravação, e base64 ainda infla o conteúdo em cerca de um terço.
   */
  protected anexar(evento: Event, numero: NumeroEtapa): void {
    const entrada = evento.target as HTMLInputElement;
    const arquivos = Array.from(entrada.files ?? []);
    entrada.value = '';
    if (!arquivos.length) {
      return;
    }

    const grandes = arquivos.filter((arquivo) => arquivo.size > TAMANHO_MAXIMO_ANEXO);
    if (grandes.length) {
      const limite = Math.round(TAMANHO_MAXIMO_ANEXO / (1024 * 1024));
      this.mensagemErro.set(
        `Cada arquivo pode ter no máximo ${limite} MB. ` +
          `Acima do limite: ${grandes.map((arquivo) => arquivo.name).join(', ')}.`,
      );
      return;
    }

    this.mensagemErro.set('');
    this.salvando.set(true);
    void Promise.all(arquivos.map(lerAnexo))
      .then((anexos) => {
        // Um arquivo por etapa, nas duas que pedem anexo: enviar outro
        // substitui o anterior, em vez de empilhar (decisão de 12/09/2026).
        this.salvando.set(false);
        this.gravar(this.documentoCom(numero, { arquivos: anexos.slice(0, 1) }));
      })
      .catch((erro: Error) => {
        this.salvando.set(false);
        this.mensagemErro.set(erro.message);
      });
  }

  protected removerAnexo(numero: NumeroEtapa, nome: string): void {
    const chave = numero === 6 ? '6' : '9';
    const arquivos = this.json()[chave].arquivos.filter((anexo) => anexo.nome !== nome);
    this.gravar(this.documentoCom(numero, { arquivos }));
  }

  /** Tamanho legível, para a lista de anexos. */
  protected tamanhoLegivel(bytes: number): string {
    return bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private gravar(json: JsonQuestionario, depois?: () => void): void {
    this.salvando.set(true);
    this.mensagemErro.set('');
    this.service
      .salvar(json)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (plano) => {
          this.salvando.set(false);
          this.json.set(plano.json_questionario);
          depois?.();
        },
        error: (err: ApiError) => {
          this.salvando.set(false);
          this.mensagemErro.set(err.message);
        },
      });
  }

  // ----- envio final -----

  private enviarPlano(): void {
    this.salvarEntao(() => {
      const incompletas = this.passos().filter((passo) => !passo.completa);
      const outras = incompletas.filter((passo) => passo.numero !== this.numero());
      if (incompletas.length) {
        // A trilha é travada: só se chega à última etapa com as anteriores
        // prontas, então quem falta é ela mesma — e o aviso é o de sempre.
        // A lista de números fica para o caso raro de o documento voltar do
        // servidor com uma etapa anterior vazia.
        this.mensagemErro.set(
          outras.length
            ? `Faltam etapas para enviar: ${outras.map((passo) => passo.numero).join(', ')}.`
            : 'Preencha esta etapa antes de avançar.',
        );
        return;
      }
      this.enviando.set(true);
      this.service
        .enviar(this.json())
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.enviando.set(false);
            void this.router.navigate([APP_ROUTES.aguardandoAprovacao], { replaceUrl: true });
          },
          error: (err: ApiError) => {
            this.enviando.set(false);
            this.mensagemErro.set(err.message);
          },
        });
    });
  }

  protected rotuloCurto(numero: NumeroEtapa): string {
    return ROTULO_CURTO[numero];
  }
}
