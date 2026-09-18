import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { QuillEditorComponent } from 'ngx-quill';
import type Quill from 'quill';

import { APP_ROUTES } from '../../core/constants/app-constants';
import { destinoPara } from '../../core/guards/plano-guard';
import { ApiError, SessionUser } from '../../core/models/auth';
import {
  Anexo,
  JsonQuestionario,
  MembroEquipe,
  NUMEROS_ETAPA,
  NumeroEtapa,
  MAXIMO_ANEXOS_POR_ETAPA,
  TAMANHO_MAXIMO_ANEXO,
  documentoVazio,
} from '../../core/models/questionario';
import { ArquivosService } from '../../core/services/arquivos';
import { Auth } from '../../core/services/auth';
import {
  QuestionarioService,
  emPreenchimento,
  etapaAcessivel,
  etapaCompleta,
  etapaParaRetomar,
  progresso,
} from '../../core/services/questionario';
import { Icone } from '../../shared/components/icone/icone';
import { TopoSessao } from '../../shared/components/topo-sessao/topo-sessao';
import {
  acessibilizarEditor,
  manterMenusNaTela,
  valorDoEditor,
} from '../../shared/editor/editor-config';
import { textoParaHtml } from '../../shared/editor/texto-para-html';
import { CAMPOS_ETAPA_1, CampoTexto, ETAPAS, Etapa, ROTULO_CURTO, etapaPorNumero } from './etapas';

/** O que a modal de confirmação vai remover, já com o texto da pergunta. */
interface Remocao {
  readonly titulo: string;
  /** Pergunta dividida em volta do nome, que aparece em negrito; `depois` traz o espaço inicial. */
  readonly antes: string;
  readonly nome: string;
  readonly depois: string;
  readonly remover: () => void;
}

/** Um passo na trilha de bolinhas do topo. */
interface Passo {
  readonly numero: NumeroEtapa;
  /** Rótulo curto da pílula, e o nome acessível ("5. Produto") que não some com ele. */
  readonly rotulo: string;
  readonly nome: string;
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
  imports: [ReactiveFormsModule, QuillEditorComponent, Icone, TopoSessao],
  templateUrl: './questionario.html',
  styleUrl: './questionario.scss',
  host: {
    '(document:keydown.escape)': 'fecharDialogos()',
  },
})
export class Questionario implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly service = inject(QuestionarioService);
  private readonly arquivos = inject(ArquivosService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly user = signal<SessionUser | null>(null);
  protected readonly json = signal<JsonQuestionario>(documentoVazio());
  protected readonly carregado = signal(false);
  protected readonly numero = signal<NumeroEtapa>(1);
  protected readonly salvando = signal(false);
  protected readonly enviando = signal(false);
  protected readonly mensagemErro = signal('');
  protected readonly mensagemSucesso = signal('');
  protected readonly membroAberto = signal(false);
  /** O membro aberto na modal para edição; `null` quando ela cadastra um novo. */
  protected readonly membroEditando = signal<MembroEquipe | null>(null);
  /** Membro ou anexo à espera da confirmação de remoção. */
  protected readonly remocao = signal<Remocao | null>(null);
  /** Etapa 9 completa e salva, esperando o "sim" antes de ir para análise. */
  protected readonly confirmandoEnvio = signal(false);
  /**
   * Só depois de tentar avançar os campos vazios ficam vermelhos. Antes disso
   * a etapa recém-aberta apareceria toda em erro, o que assusta sem ajudar.
   * A borda por `:focus`/`blur` é do CSS e não depende deste sinal.
   */
  protected readonly tentouAvancar = signal(false);

  protected readonly form = signal<FormGroup>(this.fb.group({}));

  private readonly trilha = viewChild<ElementRef<HTMLElement>>('trilha');

  /* A trilha é uma linha só e, se as nove abas não couberem, rola na
     horizontal — sem isto o passo atual ficaria fora da vista. A medida sai
     depois da renderização, quando a aba aberta já tem o rótulo dela; e rola só
     a trilha, porque `scrollIntoView` arrastava a página junto. */
  private readonly seguirPassoAtual = effect(() => {
    const numero = this.numero();
    const nav = this.trilha()?.nativeElement;
    if (!nav) {
      return;
    }
    afterNextRender(
      () => {
        const passo = nav.querySelector<HTMLElement>(`[data-passo='${numero}']`);
        if (!passo || nav.scrollWidth <= nav.clientWidth) {
          return;
        }
        const deslocamento = passo.getBoundingClientRect().left - nav.getBoundingClientRect().left;
        nav.scrollTo({
          left: nav.scrollLeft + deslocamento - (nav.clientWidth - passo.offsetWidth) / 2,
        });
      },
      { injector: this.injector },
    );
  });

  protected readonly etapa = computed<Etapa>(() => etapaPorNumero(this.numero()));
  /** Etapa de campo único e obrigatório: o asterisco vai no título, que é o rótulo dele. */
  protected readonly tituloObrigatorio = computed(() =>
    this.etapa().campos.some((campo) => !campo.rotulo && campo.obrigatorio),
  );
  protected readonly camposEtapa1 = CAMPOS_ETAPA_1;
  /** Editor vazio vira `''` (o `required` segue valendo) e sem `&nbsp;` no lugar de espaço. */
  protected readonly valorDoEditor = valorDoEditor;
  protected readonly total = ETAPAS.length;
  protected readonly ehUltima = computed(() => this.numero() === 9);
  protected readonly ehPrimeira = computed(() => this.numero() === 1);

  protected readonly passos = computed<Passo[]>(() => {
    const json = this.json();
    return NUMEROS_ETAPA.map((numero) => ({
      numero,
      rotulo: ROTULO_CURTO[numero],
      nome: `${numero}. ${ROTULO_CURTO[numero]}`,
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
  private readonly dialogoRemocao = viewChild<ElementRef<HTMLElement>>('dialogoRemocao');
  private readonly dialogoEnvio = viewChild<ElementRef<HTMLElement>>('dialogoEnvio');
  private ultimoFoco: HTMLElement | null = null;

  constructor() {
    // Abrir move o foco para a modal; fechar devolve para quem a abriu — o
    // mesmo contrato do `activation-modal`, senão `aria-modal` é promessa vazia.
    effect(() => {
      const dialogo = this.dialogoMembro() ?? this.dialogoRemocao() ?? this.dialogoEnvio();
      const aberto = this.membroAberto() || this.remocao() !== null || this.confirmandoEnvio();
      if (aberto && dialogo) {
        this.ultimoFoco ??= document.activeElement as HTMLElement | null;
        dialogo.nativeElement.focus();
      } else if (!aberto && this.ultimoFoco) {
        // Depois de remover, o botão que abriu a modal já saiu da tela.
        if (this.ultimoFoco.isConnected) {
          this.ultimoFoco.focus();
        }
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
      controles[campo.nome] = [
        textoParaHtml(String(aba[campo.nome] ?? '')),
        validadores(campo.obrigatorio),
      ];
    }
    this.form.set(this.fb.group(controles));
  }

  /** Traduz a barra do editor, liga-o ao rótulo do campo e segura os menus na tela. */
  protected aoCriarEditor(editor: Quill, campo: CampoTexto): void {
    // Etapa de campo único não tem rótulo: o título do cartão faz esse papel.
    acessibilizarEditor(editor, campo.rotulo ? `${campo.nome}-rotulo` : 'quest-titulo');
    manterMenusNaTela(editor);
    editor.root.setAttribute('aria-required', String(campo.obrigatorio));
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
      this.voltarAoTopo();
    });
  }

  /**
   * A etapa nova começa do topo. Sem isto, quem clicava "Próximo" no fim de
   * uma etapa longa caía no meio — ou no fim — da seguinte.
   */
  private voltarAoTopo(): void {
    window.scrollTo({ top: 0 });
  }

  /**
   * Leva a tela até o que falta preencher, logo abaixo do topo grudado. No
   * celular o "Próximo" fica no fim de uma etapa longa: o campo vazio, ou o
   * aviso lá em cima, ficava fora da vista, e o toque parecia não fazer nada.
   * Sem pendência no cartão (etapa anterior vazia), sobe até o aviso.
   */
  private mostrarPendencia(): void {
    afterNextRender(
      () => {
        const raiz = this.host.nativeElement;
        const erro = raiz.querySelector(
          '.quest-cartao .field-error, .quest-cartao .quest-vazio--invalido',
        );
        const alvo = erro?.closest('.form-group, .quest-anexos') ?? erro;
        if (!alvo) {
          this.voltarAoTopo();
          return;
        }
        const topo = raiz.querySelector('.quest-topo')?.getBoundingClientRect().height ?? 0;
        window.scrollTo({ top: alvo.getBoundingClientRect().top + window.scrollY - topo - 16 });
      },
      { injector: this.injector },
    );
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
      this.pedirEnvio();
      return;
    }
    this.salvarEntao(() => {
      const proxima = (this.numero() + 1) as NumeroEtapa;
      if (!this.passos().find((passo) => passo.numero === proxima)?.acessivel) {
        this.mensagemErro.set('Preencha esta etapa antes de avançar.');
        this.mostrarPendencia();
        return;
      }
      this.numero.set(proxima);
      this.montarFormulario();
      this.tentouAvancar.set(false);
      this.mensagemSucesso.set('');
      this.voltarAoTopo();
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
    this.membroEditando.set(null);
    this.membroAberto.set(true);
  }

  /** A mesma modal do cadastro, já preenchida com o membro. */
  protected editarMembro(membro: MembroEquipe): void {
    const { nome, formacao_academica, experiencia, email, telefone } = membro;
    this.formMembro.reset({ nome, formacao_academica, experiencia, email, telefone });
    this.membroEditando.set(membro);
    this.membroAberto.set(true);
  }

  protected fecharMembro(): void {
    if (this.membroAberto()) {
      this.membroAberto.set(false);
      this.membroEditando.set(null);
    }
  }

  /** Esc fecha a modal que estiver aberta. */
  protected fecharDialogos(): void {
    this.fecharMembro();
    this.cancelarRemocao();
    this.cancelarEnvio();
  }

  /** Prende o Tab dentro da modal. O `shift` vem do template, como no padrão. */
  protected prenderTab(evento: Event, shift: boolean, dialogo: HTMLElement): void {
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

  /** Cadastra, ou substitui no mesmo lugar da lista quando a modal veio do lápis. */
  protected salvarMembro(): void {
    if (this.formMembro.invalid) {
      this.formMembro.markAllAsTouched();
      return;
    }
    const valores = this.formMembro.getRawValue();
    const editando = this.membroEditando();
    const equipe = editando
      ? this.membros().map((membro) =>
          membro.id === editando.id ? { id: editando.id, ...valores } : membro,
        )
      : [...this.membros(), { id: `m-${Date.now()}`, ...valores }];
    this.gravar(this.documentoCom(4, { equipe }));
    this.fecharMembro();
  }

  protected pedirRemocaoMembro(alvo: MembroEquipe): void {
    this.remocao.set({
      titulo: 'Remover membro',
      antes: 'Tem certeza que deseja remover',
      nome: alvo.nome,
      depois: ' da equipe?',
      remover: () => {
        const equipe = this.membros().filter((membro) => membro.id !== alvo.id);
        this.gravar(this.documentoCom(4, { equipe }));
      },
    });
  }

  protected cancelarRemocao(): void {
    if (this.remocao()) {
      this.remocao.set(null);
    }
  }

  protected confirmarRemocao(): void {
    this.remocao()?.remover();
    this.remocao.set(null);
  }

  // ----- anexos -----

  /**
   * Envia primeiro, grava a ficha depois — assim a lista nunca exibe arquivo
   * que o backend não recebeu.
   */
  protected anexar(evento: Event, numero: NumeroEtapa): void {
    const entrada = evento.target as HTMLInputElement;
    const arquivos = Array.from(entrada.files ?? []);
    entrada.value = '';
    if (!arquivos.length) {
      return;
    }

    // Mesmo nome substitui o que já estava lá; o resto se soma à lista.
    const nomesNovos = new Set(arquivos.map((arquivo) => arquivo.name));
    const mantidos = this.json()[numero === 6 ? '6' : '9'].arquivos.filter(
      (anexo) => !nomesNovos.has(anexo.nome),
    );
    if (mantidos.length + arquivos.length > MAXIMO_ANEXOS_POR_ETAPA) {
      const vagas = MAXIMO_ANEXOS_POR_ETAPA - mantidos.length;
      this.mensagemErro.set(
        `Cada etapa aceita até ${MAXIMO_ANEXOS_POR_ETAPA} arquivos. ` +
          (vagas > 0
            ? `Ainda cabe${vagas > 1 ? 'm' : ''} ${vagas}.`
            : 'Remova algum para enviar outro.'),
      );
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
    this.arquivos
      .enviar(numero, arquivos)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (anexos) => {
          this.salvando.set(false);
          this.gravar(this.documentoCom(numero, { arquivos: [...mantidos, ...anexos] }));
        },
        error: (err: ApiError) => {
          this.salvando.set(false);
          this.mensagemErro.set(err.message);
        },
      });
  }

  protected pedirRemocaoAnexo(numero: NumeroEtapa, nome: string): void {
    this.remocao.set({
      titulo: 'Remover arquivo',
      antes: 'Tem certeza que deseja remover o arquivo',
      nome,
      depois: '?',
      // Tira a ficha; o arquivo fica no disco do backend, que não tem rota
      // para apagar.
      remover: () => {
        const chave = numero === 6 ? '6' : '9';
        const arquivos = this.json()[chave].arquivos.filter((anexo) => anexo.nome !== nome);
        this.gravar(this.documentoCom(numero, { arquivos }));
      },
    });
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

  /** Salva e confere as nove; só então pergunta, porque depois de enviado não se edita mais. */
  private pedirEnvio(): void {
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
        this.mostrarPendencia();
        return;
      }
      this.confirmandoEnvio.set(true);
    });
  }

  protected cancelarEnvio(): void {
    if (this.confirmandoEnvio() && !this.enviando()) {
      this.confirmandoEnvio.set(false);
    }
  }

  protected confirmarEnvio(): void {
    if (this.enviando()) {
      return;
    }
    this.enviando.set(true);
    this.service
      .enviar(this.json())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enviando.set(false);
          this.confirmandoEnvio.set(false);
          void this.router.navigate([APP_ROUTES.aguardandoAprovacao], { replaceUrl: true });
        },
        error: (err: ApiError) => {
          this.enviando.set(false);
          this.confirmandoEnvio.set(false);
          this.mensagemErro.set(err.message);
        },
      });
  }
}
