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
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { QuillEditorComponent } from 'ngx-quill';
import type Quill from 'quill';
import { forkJoin } from 'rxjs';

import { APP_ROUTES } from '../../core/constants/app-constants';
import { destinoPara } from '../../core/guards/plano-guard';
import { ApiError, SessionUser } from '../../core/models/auth';
import {
  Anexo,
  CLASSE_NOTA,
  ChaveEtapa,
  DecisaoPlano,
  EXTENSOES_ANEXO,
  JsonQuestionario,
  MAXIMO_ANEXOS_POR_ETAPA,
  MembroEquipe,
  NUMEROS_ETAPA,
  Avaliacao,
  NumeroEtapa,
  ROTULO_NOTA,
  ROTULO_STATUS,
  StatusQuestionario,
  TAMANHO_MAXIMO_ANEXO,
  documentoVazio,
} from '../../core/models/questionario';
import { ArquivosService } from '../../core/services/arquivos';
import { Auth } from '../../core/services/auth';
import { PlanosService } from '../../core/services/planos';
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
import { VisualizadorArquivo } from '../../shared/components/visualizador-arquivo/visualizador-arquivo';
import { Mascara, mascararValorSalvo } from '../../shared/directives/mascara';
import { salvarComo } from '../../shared/salvar-como';
import {
  acessibilizarEditor,
  manterMenusNaTela,
  valorDoEditor,
} from '../../shared/editor/editor-config';
import { formatarQuando } from '../../shared/data-hora';
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
 * Questionário Plano de Negócios, em tela cheia e sem menu. O estado é um
 * documento só (`json_questionario`), com uma entrada por aba de "1" a "9";
 * toda gravação manda o documento inteiro, porque o `PUT` substitui o JSON.
 */
@Component({
  selector: 'app-questionario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    QuillEditorComponent,
    Icone,
    TopoSessao,
    RouterLink,
    VisualizadorArquivo,
    Mascara,
  ],
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
  private readonly planos = inject(PlanosService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * `'edicao'` (padrão): o incubado preenche o próprio plano. `'avaliacao'`: a mesma
   * tela bloqueada para edição, com o card de nota por etapa. Vem do `data.modo` da rota.
   */
  readonly modo = input<'edicao' | 'avaliacao'>('edicao');
  /** No modo avaliação, o e-mail do dono do plano (`:email` da rota). */
  readonly email = input('');
  /** O `accept` dos seletores de anexo: a lista do backend, para o navegador já filtrar. */
  protected readonly tiposAceitos = EXTENSOES_ANEXO.join(',');
  protected readonly ehAvaliacao = computed(() => this.modo() === 'avaliacao');
  protected readonly voltarLista = APP_ROUTES.planosDeNegocio;

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
  /** Etapa 9 completa na tela, esperando o "sim" antes de ir para análise. */
  protected readonly confirmandoEnvio = signal(false);
  /** Anexo aberto no modal de pré-visualização; `null` quando fechado. */
  protected readonly arquivoPreview = signal<Anexo | null>(null);
  /** A etapa de onde o anexo aberto veio — a rota de download precisa da aba. */
  private readonly abaPreview = signal<NumeroEtapa>(6);
  /**
   * Conteúdo do anexo aberto, para a modal desenhar o arquivo de verdade. Fica
   * `null` enquanto baixa, quando falha e sempre no modo avaliação.
   */
  protected readonly conteudoPreview = signal<Blob | null>(null);
  protected readonly baixandoPreview = signal(false);
  protected readonly erroPreview = signal('');
  /**
   * Os campos vazios só ficam vermelhos depois de tentar avançar; antes, a etapa
   * recém-aberta apareceria toda em erro. A borda por `:focus`/`blur` é do CSS.
   */
  protected readonly tentouAvancar = signal(false);

  protected readonly form = signal<FormGroup>(this.fb.group({}));

  // ----- avaliação (só no modo 'avaliacao') -----

  protected readonly valores: readonly (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 4, 5];
  protected readonly rotuloNota = ROTULO_NOTA;
  protected readonly classeNota = CLASSE_NOTA;
  /** Rascunho local da nota por etapa, antes de gravar. */
  protected readonly escolhido = signal<Record<string, 1 | 2 | 3 | 4 | 5 | null>>({});
  protected readonly comentario = signal<Record<string, string>>({});
  /** Etapa cuja nota está sendo gravada (separado do `salvando` do documento). */
  protected readonly salvandoNota = signal<NumeroEtapa | null>(null);
  /** Etapa cuja nota já gravada foi reaberta para edição. */
  protected readonly editandoNota = signal<NumeroEtapa | null>(null);

  /** A minha avaliação em cada etapa, para o card abrir preenchido. */
  protected readonly minhas = computed<Map<string, Avaliacao>>(() => {
    const email = this.user()?.email;
    const json = this.json();
    const minhas = new Map<string, Avaliacao>();
    for (const numero of NUMEROS_ETAPA) {
      const chave = String(numero);
      const avaliacao = json[chave as ChaveEtapa].avaliacao;
      if (avaliacao && avaliacao.avaliador === email) {
        minhas.set(chave, avaliacao);
      }
    }
    return minhas;
  });

  /** A minha avaliação da etapa aberta, quando já gravada. */
  protected readonly minhaDaEtapa = computed<Avaliacao | null>(
    () => this.minhas().get(String(this.numero())) ?? null,
  );

  /**
   * O formulário aparece quando ainda não avaliei esta etapa ou quando pedi para
   * editar; com nota gravada e fora da edição, o card mostra só a leitura.
   */
  protected readonly formularioAberto = computed(
    () =>
      // A coordenação decide, não avalia: para ela o card é sempre leitura.
      !this.ehCoordenacao() &&
      !this.etapaBloqueada() &&
      (this.minhaDaEtapa() === null || this.editandoNota() === this.numero()),
  );

  /** Reabre a própria nota para edição, já preenchida com o que foi gravado. */
  protected editarNota(): void {
    this.editandoNota.set(this.numero());
  }

  /** Desiste da edição: o rascunho vai fora e a nota gravada volta à leitura. */
  protected cancelarEdicao(): void {
    const numero = this.numero();
    this.escolhido.set(semEtapa(this.escolhido(), numero));
    this.comentario.set(semEtapa(this.comentario(), numero));
    this.editandoNota.set(null);
  }

  /** A nota desta etapa: a minha, ou a de quem avaliou antes — a etapa tem uma só. */
  protected readonly notaDaEtapa = computed<Avaliacao | null>(
    () => this.json()[String(this.numero()) as ChaveEtapa].avaliacao,
  );

  /**
   * O que a escala e o campo mostram: o rascunho enquanto edito, a nota gravada
   * quando o card está travado — inclusive a de outro consultor, que não passa
   * pelo rascunho.
   */
  protected readonly valorEmTela = computed<1 | 2 | 3 | 4 | 5 | null>(() =>
    this.formularioAberto() ? this.valorDe(this.numero()) : (this.notaDaEtapa()?.nota ?? null),
  );

  protected readonly textoEmTela = computed(() =>
    this.formularioAberto() ? this.textoDe(this.numero()) : (this.notaDaEtapa()?.comentario ?? ''),
  );

  /** Os dois rótulos do card: é por eles que se sabe em que estado ele está. */
  protected readonly rotuloAvaliacao = computed(() => {
    if (this.formularioAberto()) {
      return this.minhaDaEtapa() ? 'Editando sua avaliação' : 'Avaliação';
    }
    // Fora a minha, o rótulo é neutro: quem avaliou vai na assinatura, no
    // rodapé do card, com nome e e-mail — não no título.
    return this.minhaDaEtapa() && !this.ehCoordenacao() ? 'Sua avaliação' : 'Avaliação';
  });

  protected readonly rotuloComentario = computed(() => {
    if (this.formularioAberto()) {
      return 'Notas e observações';
    }
    return this.minhaDaEtapa() && !this.ehCoordenacao()
      ? 'Suas notas e observações'
      : 'Notas e observações';
  });

  /** Campo travado e sem texto não é um convite a escrever: é um "não houve". */
  protected readonly placeholderComentario = computed(() => {
    if (this.formularioAberto()) {
      return 'Adicione suas notas e observações sobre esta etapa…';
    }
    // Etapa sem nota nenhuma não tem comentário "faltando": quem explica é o
    // aviso no rodapé do card.
    return this.notaDaEtapa() ? 'Sem comentário.' : '';
  });

  /**
   * Cada etapa só pode ser avaliada uma vez: nota de outro consultor trava o
   * formulário; o autor continua podendo editar a dele.
   */
  protected readonly etapaBloqueada = computed(() => {
    const avaliacao = this.notaDaEtapa();
    return avaliacao !== null && avaliacao.avaliador !== this.user()?.email;
  });

  // ----- decisão da coordenação (aprovar / devolver) -----

  /** Situação do plano lido, para a barra saber se já houve decisão. */
  protected readonly statusPlano = signal<StatusQuestionario | null>(null);
  /** Qual decisão está em confirmação na modal; `null` com a modal fechada. */
  protected readonly decidindo = signal<'aprovado' | 'rejeitado' | null>(null);
  protected readonly justificativa = signal('');
  protected readonly salvandoDecisao = signal(false);

  /**
   * Só a coordenação decide e corrige as respostas do incubado — e a trava que
   * vale é a do servidor.
   */
  protected readonly ehCoordenacao = computed(
    () => this.ehAvaliacao() && this.user()?.role === 'admin',
  );

  /**
   * Plano aberto por quem só avalia: os campos do incubado ficam travados. Até o
   * `/users/me` responder vale a trava, para ninguém digitar no plano alheio
   * antes de se saber quem é.
   */
  protected readonly somenteLeitura = computed(() => this.ehAvaliacao() && !this.ehCoordenacao());

  /** Quantas das nove etapas já receberam nota, de qualquer avaliador. */
  protected readonly etapasAvaliadas = computed(
    () =>
      NUMEROS_ETAPA.filter((numero) => this.json()[String(numero) as ChaveEtapa].avaliacao !== null)
        .length,
  );

  protected readonly totalEtapas = NUMEROS_ETAPA.length;

  /** Aprovar ou devolver só depois de o plano inteiro ter sido lido. */
  protected readonly podeDecidir = computed(
    () => this.etapasAvaliadas() === NUMEROS_ETAPA.length && this.salvandoDecisao() === false,
  );

  /** Média das notas pontuadas do plano, para a barra resumir a leitura. */
  protected readonly mediaDoPlano = computed(() => {
    const json = this.json();
    const valores = NUMEROS_ETAPA.map(
      (numero) => json[String(numero) as ChaveEtapa].avaliacao?.nota,
    ).filter((nota): nota is 1 | 2 | 3 | 4 | 5 => nota != null);
    if (!valores.length) {
      return null;
    }
    const media = Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 10) / 10;
    // Vírgula decimal: é número lido por gente, em PT-BR.
    return media.toLocaleString('pt-BR');
  });

  /** A decisão já tomada, quando houve — quem, quando e por quê. */
  protected readonly decisao = computed<DecisaoPlano | null>(() => this.json().decisao ?? null);

  protected readonly rotuloStatusPlano = computed(() => {
    const status = this.statusPlano();
    return status ? ROTULO_STATUS[status] : '';
  });

  /** Devolver exige motivo; aprovar, não. */
  protected readonly decisaoValida = computed(
    () => this.decidindo() === 'aprovado' || this.justificativa().trim().length > 0,
  );

  protected abrirDecisao(status: 'aprovado' | 'rejeitado'): void {
    this.justificativa.set('');
    this.decidindo.set(status);
  }

  protected fecharDecisao(): void {
    if (this.decidindo() !== null) {
      this.decidindo.set(null);
    }
  }

  protected escreverJustificativa(evento: Event): void {
    this.justificativa.set((evento.target as HTMLTextAreaElement).value);
  }

  /** Confirma a decisão. O `por` e o `em` são do servidor, não daqui. */
  protected confirmarDecisao(): void {
    const status = this.decidindo();
    if (status === null || !this.decisaoValida() || this.salvandoDecisao()) {
      return;
    }
    this.salvandoDecisao.set(true);
    this.limparAvisos();
    this.planos
      .decidir(this.email(), { status, justificativa: this.justificativa().trim() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (plano) => {
          this.json.set(plano.json_questionario);
          this.statusPlano.set(plano.status_questionario);
          this.salvandoDecisao.set(false);
          this.decidindo.set(null);
          this.mensagemSucesso.set(
            status === 'aprovado' ? 'Plano aprovado.' : 'Plano devolvido para ajustes.',
          );
        },
        error: (err: ApiError) => {
          this.salvandoDecisao.set(false);
          this.decidindo.set(null);
          this.mensagemErro.set(err.message);
        },
      });
  }

  /** Data e hora da nota: a hora importa porque a etapa pode ser regravada no mesmo dia. */
  protected readonly dataNota = formatarQuando;

  /** Etapa cuja saída está pendente de confirmação (rascunho não salvo). */
  protected readonly saidaPendente = signal<NumeroEtapa | null>(null);

  private readonly trilha = viewChild<ElementRef<HTMLElement>>('trilha');

  /* A trilha rola na horizontal quando as nove abas não cabem; a medida sai depois
     da renderização, e rola só a trilha porque `scrollIntoView` arrastava a página. */
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
    // Avaliação: trilha destravada (o avaliador navega livre) e o verde marca as
    // etapas que ele já avaliou, não a completude do incubado.
    const avaliacao = this.ehAvaliacao();
    const minhas = this.minhas();
    // Para a coordenação, "completa" é etapa avaliada por qualquer consultor —
    // ela não dá nota, então marcar só as dela deixaria a trilha sempre cinza.
    const coordenacao = this.ehCoordenacao();
    return NUMEROS_ETAPA.map((numero) => ({
      numero,
      rotulo: ROTULO_CURTO[numero],
      nome: `${numero}. ${ROTULO_CURTO[numero]}`,
      completa: avaliacao
        ? coordenacao
          ? json[String(numero) as ChaveEtapa].avaliacao !== null
          : minhas.has(String(numero))
        : etapaCompleta(json, numero),
      acessivel: avaliacao ? true : etapaAcessivel(json, numero),
      atual: numero === this.numero(),
    }));
  });

  /**
   * Na avaliação a barra mede o avanço de quem está na tela: as notas do consultor
   * ou, para a coordenação (que não dá nota), as etapas avaliadas por qualquer um.
   */
  protected readonly progresso = computed(() => {
    if (!this.ehAvaliacao()) {
      return progresso(this.json());
    }
    const feitas = this.ehCoordenacao() ? this.etapasAvaliadas() : this.minhas().size;
    return Math.round((feitas / NUMEROS_ETAPA.length) * 100);
  });

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
  private readonly dialogoSaida = viewChild<ElementRef<HTMLElement>>('dialogoSaida');
  private readonly dialogoDecisao = viewChild<ElementRef<HTMLElement>>('dialogoDecisao');
  private ultimoFoco: HTMLElement | null = null;

  constructor() {
    // Abrir move o foco para a modal; fechar devolve para quem a abriu — o
    // mesmo contrato do `activation-modal`, senão `aria-modal` é promessa vazia.
    effect(() => {
      const dialogo =
        this.dialogoMembro() ??
        this.dialogoRemocao() ??
        this.dialogoEnvio() ??
        this.dialogoSaida() ??
        this.dialogoDecisao();
      const aberto =
        this.membroAberto() ||
        this.remocao() !== null ||
        this.confirmandoEnvio() ||
        this.saidaPendente() !== null ||
        this.decidindo() !== null;
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
        next: (user) => {
          this.user.set(user);
        },
        error: () => {
          this.auth.clearSession();
          void this.router.navigate([APP_ROUTES.login]);
        },
      });

    if (this.ehAvaliacao()) {
      this.carregarParaAvaliacao();
      return;
    }

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
          this.conferirAnexosNoDisco();
        },
        error: (err: ApiError) => this.mensagemErro.set(err.message),
      });
  }

  /**
   * Modo avaliação: lê o plano de outra pessoa sem redirecionar por status, sem
   * conferir anexo no disco (o disco é do avaliado) e sem gravar o documento.
   */
  private carregarParaAvaliacao(): void {
    this.planos
      .plano(this.email())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (plano) => {
          this.json.set(plano.json_questionario);
          this.statusPlano.set(plano.status_questionario);
          this.numero.set(1);
          this.carregado.set(true);
          this.montarFormulario();
        },
        error: (err: ApiError) => this.mensagemErro.set(err.message),
      });
  }

  /**
   * O documento e o disco do backend podem discordar; quem manda é o disco: ficha
   * sem arquivo sai da lista e da próxima gravação. Roda depois de a tela abrir
   * para não atrasar a primeira pintura com dois `GET`.
   */
  private conferirAnexosNoDisco(): void {
    forkJoin({ '6': this.arquivos.listar(6), '9': this.arquivos.listar(9) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((noDisco) => {
        const json = this.json();
        const semArquivo = (chave: '6' | '9'): Anexo[] =>
          json[chave].arquivos.filter((anexo) => !noDisco[chave].includes(anexo.nome));

        if (!semArquivo('6').length && !semArquivo('9').length) {
          return;
        }
        const limpo: JsonQuestionario = {
          ...json,
          '6': {
            ...json['6'],
            arquivos: json['6'].arquivos.filter((a) => noDisco['6'].includes(a.nome)),
          },
          '9': {
            ...json['9'],
            arquivos: json['9'].arquivos.filter((a) => noDisco['9'].includes(a.nome)),
          },
        };
        this.gravar(limpo);
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
        const salvo = String(aba[campo.nome] ?? '');
        const valor = campo.mascara ? mascararValorSalvo(campo.mascara, salvo) : salvo;
        controles[campo.nome] = [valor, validadores(campo.obrigatorio)];
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
    const chave = String(this.numero()) as ChaveEtapa;
    return this.json()[chave] as unknown as Record<string, unknown>;
  }

  /** Mescla campos numa aba e devolve o documento inteiro, pronto para o PUT. */
  private documentoCom(numero: NumeroEtapa, campos: Record<string, unknown>): JsonQuestionario {
    const chave = String(numero) as ChaveEtapa;
    const json = this.json();
    return { ...json, [chave]: { ...json[chave], ...campos } };
  }

  protected irPara(numero: NumeroEtapa): void {
    // Avaliação: navegação livre. O avaliador não edita, então não há o que gravar.
    if (this.ehAvaliacao()) {
      if (numero === this.numero()) {
        return;
      }
      // A coordenação corrige: o que mudou na etapa é salvo antes de sair, como
      // no fluxo do incubado. Sem mudança, só navega.
      if (this.ehCoordenacao()) {
        if (this.form().dirty) {
          this.salvarEntao(() => this.navegarAvaliacao(numero));
        } else {
          this.navegarAvaliacao(numero);
        }
        return;
      }
      // Rascunho de nota não salvo: pergunta antes de sair, senão ele se perde.
      if (this.etapaSuja(this.numero())) {
        this.saidaPendente.set(numero);
        return;
      }
      this.navegarAvaliacao(numero);
      return;
    }
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
   * A etapa nova começa do topo: sem isto, "Próximo" no fim de uma etapa longa
   * caía no meio da seguinte.
   */
  private voltarAoTopo(): void {
    window.scrollTo({ top: 0 });
  }

  /**
   * Leva a tela até o que falta preencher, logo abaixo do topo grudado; no celular
   * o campo vazio ficava fora da vista e o toque parecia não fazer nada. Sem
   * pendência no cartão, sobe até o aviso.
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

  /** Troca de etapa no modo avaliação (sem gravar o documento). */
  private navegarAvaliacao(numero: NumeroEtapa): void {
    this.editandoNota.set(null);
    this.numero.set(numero);
    this.montarFormulario();
    this.mensagemSucesso.set('');
    this.voltarAoTopo();
  }

  /** A etapa tem rascunho de nota diferente do que está salvo? */
  private etapaSuja(numero: NumeroEtapa): boolean {
    const chave = String(numero);
    const rascunhoValor = this.escolhido()[chave];
    const rascunhoTexto = this.comentario()[chave];
    if (rascunhoValor === undefined && rascunhoTexto === undefined) {
      return false;
    }
    const salva = this.minhas().get(chave);
    const valor = rascunhoValor === undefined ? (salva?.nota ?? null) : rascunhoValor;
    const texto = rascunhoTexto === undefined ? (salva?.comentario ?? '') : rascunhoTexto;
    return valor !== (salva?.nota ?? null) || texto.trim() !== (salva?.comentario ?? '').trim();
  }

  /** "Sair sem salvar": descarta o rascunho e vai para a etapa pendente. */
  protected confirmarSaida(): void {
    const destino = this.saidaPendente();
    if (destino === null) {
      return;
    }
    this.escolhido.set(semEtapa(this.escolhido(), this.numero()));
    this.comentario.set(semEtapa(this.comentario(), this.numero()));
    this.saidaPendente.set(null);
    this.navegarAvaliacao(destino);
  }

  protected cancelarSaida(): void {
    if (this.saidaPendente() !== null) {
      this.saidaPendente.set(null);
    }
  }

  protected avancar(): void {
    // Avaliação: só navega para a próxima etapa, sem validar nem gravar.
    if (this.ehAvaliacao()) {
      if (!this.ehUltima()) {
        this.irPara((this.numero() + 1) as NumeroEtapa);
      }
      return;
    }
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
    const aviso = this.ehCoordenacao()
      ? 'Alterações salvas no plano.'
      : 'Formulário salvo com sucesso!';
    this.salvarEntao(() => this.mensagemSucesso.set(aviso));
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
    this.fecharPreview();
    this.cancelarSaida();
  }

  // ----- pré-visualização de anexo -----

  /**
   * De quem é a pasta de anexos que esta tela lê: no modo avaliação, a do dono
   * do plano (`?email=`); no do incubado, a de quem está logado.
   */
  private readonly donoDosAnexos = computed(() => (this.ehAvaliacao() ? this.email() : undefined));

  /**
   * Abre a modal e já busca o conteúdo, para a prévia ser o arquivo real. No modo
   * avaliação lê o disco do dono do plano; a coordenação ainda recebe `403` do backend.
   */
  protected abrirPreview(arquivo: Anexo, numero: NumeroEtapa): void {
    this.abaPreview.set(numero);
    this.arquivoPreview.set(arquivo);
    this.conteudoPreview.set(null);
    this.erroPreview.set('');

    this.baixandoPreview.set(true);
    this.arquivos
      .baixar(numero, arquivo.nome, this.donoDosAnexos())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (conteudo) => {
          this.baixandoPreview.set(false);
          // O modal pode ter sido fechado enquanto baixava; aí não há o que mostrar.
          if (this.arquivoPreview()?.nome === arquivo.nome) {
            this.conteudoPreview.set(conteudo);
          }
        },
        error: (err: ApiError) => {
          this.baixandoPreview.set(false);
          this.erroPreview.set(err.message);
        },
      });
  }

  protected fecharPreview(): void {
    if (this.arquivoPreview()) {
      this.arquivoPreview.set(null);
      this.conteudoPreview.set(null);
      this.erroPreview.set('');
      this.baixandoPreview.set(false);
    }
  }

  /**
   * Salva o anexo aberto no disco do usuário. Reaproveita o que a prévia já
   * baixou; se não há nada (falhou, ou é tipo sem prévia), busca de novo.
   */
  protected baixarAnexo(): void {
    const arquivo = this.arquivoPreview();
    if (!arquivo) {
      return;
    }

    const pronto = this.conteudoPreview();
    if (pronto) {
      salvarComo(pronto, arquivo.nome);
      return;
    }

    this.baixandoPreview.set(true);
    this.erroPreview.set('');
    this.arquivos
      .baixar(this.abaPreview(), arquivo.nome, this.donoDosAnexos())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (conteudo) => {
          this.baixandoPreview.set(false);
          this.conteudoPreview.set(conteudo);
          salvarComo(conteudo, arquivo.nome);
        },
        error: (err: ApiError) => {
          this.baixandoPreview.set(false);
          this.erroPreview.set(err.message);
        },
      });
  }

  /** Prende o Tab dentro da modal. O `shift` vem do template. */
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
    this.limparAvisos();

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
      // Apaga do disco primeiro; a ficha só sai se o backend confirmou, para o
      // documento nunca ficar mais limpo que o disco.
      remover: () => {
        this.salvando.set(true);
        this.limparAvisos();
        this.arquivos
          .apagar(numero, [nome])
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.salvando.set(false);
              const chave = numero === 6 ? '6' : '9';
              const arquivos = this.json()[chave].arquivos.filter((anexo) => anexo.nome !== nome);
              this.gravar(this.documentoCom(numero, { arquivos }));
            },
            error: (err: ApiError) => {
              this.salvando.set(false);
              this.mensagemErro.set(err.message);
            },
          });
      },
    });
  }

  /** Tamanho legível, para a lista de anexos. */
  protected tamanhoLegivel(bytes: number): string {
    return bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Cada ação nova começa sem os avisos da anterior: sem isto, o "salvo com
   * sucesso" do rascunho continuava no topo junto com o erro do envio.
   */
  private limparAvisos(): void {
    this.mensagemErro.set('');
    this.mensagemSucesso.set('');
  }

  private gravar(json: JsonQuestionario, depois?: () => void): void {
    this.salvando.set(true);
    this.limparAvisos();
    // Na avaliação só a coordenação grava, e no plano de outra pessoa; fora dela,
    // quem grava é o dono, no próprio plano.
    const gravacao = this.ehCoordenacao()
      ? this.planos.corrigir(this.email(), json)
      : this.service.salvar(json);
    gravacao.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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

  /**
   * Confere as nove com o que está na tela e só então pergunta — nada vai ao
   * servidor antes do "sim", porque depois de enviado não se edita mais. Gravar
   * aqui gerava um `PUT` de rascunho e outro no envio: duas requisições por clique.
   */
  private pedirEnvio(): void {
    if (this.salvando() || this.enviando()) {
      return;
    }
    const json = this.documentoAtual();
    const incompletas = NUMEROS_ETAPA.filter((numero) => !etapaCompleta(json, numero));
    const outras = incompletas.filter((numero) => numero !== this.numero());
    if (incompletas.length) {
      // A trilha travada garante que só a última etapa pode faltar; a lista de
      // números cobre o caso raro de o servidor devolver uma etapa anterior vazia.
      this.limparAvisos();
      this.mensagemErro.set(
        outras.length
          ? `Faltam etapas para enviar: ${outras.join(', ')}.`
          : 'Preencha esta etapa antes de avançar.',
      );
      this.mostrarPendencia();
      return;
    }
    this.confirmandoEnvio.set(true);
  }

  /** O documento com a etapa aberta como está na tela, ainda não gravada. */
  private documentoAtual(): JsonQuestionario {
    const valores = this.form().getRawValue() as Record<string, unknown>;
    return this.documentoCom(this.numero(), valores);
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
    this.limparAvisos();
    // Um único `PUT`: a etapa aberta vai junto com o status de envio.
    this.service
      .enviar(this.documentoAtual())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (plano) => {
          this.json.set(plano.json_questionario);
          this.form().markAsPristine();
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

  // ----- nota do avaliador (card no modo 'avaliacao') -----

  /** Valor escolhido na etapa, ou `null` para quem só quer comentar. */
  protected valorDe(numero: NumeroEtapa): 1 | 2 | 3 | 4 | 5 | null {
    const escolhido = this.escolhido()[String(numero)];
    return escolhido === undefined ? (this.minhas().get(String(numero))?.nota ?? null) : escolhido;
  }

  protected textoDe(numero: NumeroEtapa): string {
    const digitado = this.comentario()[String(numero)];
    return digitado === undefined
      ? (this.minhas().get(String(numero))?.comentario ?? '')
      : digitado;
  }

  protected escolher(numero: NumeroEtapa, valor: 1 | 2 | 3 | 4 | 5): void {
    const atual = this.valorDe(numero);
    // Clicar de novo no mesmo valor desmarca: é como se comenta sem pontuar.
    this.escolhido.set({ ...this.escolhido(), [String(numero)]: atual === valor ? null : valor });
  }

  protected escrever(numero: NumeroEtapa, evento: Event): void {
    const texto = (evento.target as HTMLTextAreaElement).value;
    this.comentario.set({ ...this.comentario(), [String(numero)]: texto });
  }

  protected podeAvaliar(numero: NumeroEtapa): boolean {
    return (
      this.salvandoNota() === null &&
      (this.valorDe(numero) !== null || this.textoDe(numero).trim().length > 0)
    );
  }

  /** Grava a nota desta etapa, uma requisição por etapa. */
  protected avaliar(numero: NumeroEtapa): void {
    if (!this.podeAvaliar(numero)) {
      return;
    }
    this.salvandoNota.set(numero);
    this.mensagemErro.set('');
    this.mensagemSucesso.set('');

    this.planos
      .avaliar(this.email(), {
        aba: numero,
        nota: this.valorDe(numero),
        comentario: this.textoDe(numero).trim(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (plano) => {
          this.json.set(plano.json_questionario);
          // O que foi digitado já voltou no documento: limpar o rascunho local
          // evita que ele mascare a nota gravada.
          this.escolhido.set(semEtapa(this.escolhido(), numero));
          this.comentario.set(semEtapa(this.comentario(), numero));
          this.salvandoNota.set(null);
          this.editandoNota.set(null);
          this.mensagemSucesso.set(`Avaliação da etapa ${numero} registrada.`);
        },
        error: (err: ApiError) => {
          this.salvandoNota.set(null);
          this.mensagemErro.set(err.message);
        },
      });
  }
}

function semEtapa<T>(mapa: Record<string, T>, numero: NumeroEtapa): Record<string, T> {
  const copia = { ...mapa };
  delete copia[String(numero)];
  return copia;
}
