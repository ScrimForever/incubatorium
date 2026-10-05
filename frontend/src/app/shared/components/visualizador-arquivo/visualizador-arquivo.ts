import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { Anexo } from '../../../core/models/questionario';
import { Icone } from '../icone/icone';

/** Categorias que ganham uma pré-visualização própria. */
type Categoria = 'imagem' | 'pdf' | 'planilha' | 'documento' | 'texto' | 'outro';

const ROTULO: Record<Categoria, string> = {
  imagem: 'Imagem',
  pdf: 'Documento PDF',
  planilha: 'Planilha',
  documento: 'Documento de texto',
  texto: 'Arquivo de texto',
  outro: 'Arquivo',
};

/** As categorias que o navegador desenha sozinho a partir de um `blob:`. */
const RENDERIZAVEIS: readonly Categoria[] = ['imagem', 'pdf', 'texto'];

/**
 * Modal de pré-visualização de anexo — o arquivo de verdade desde 28/09/2026,
 * quando o backend publicou o download como `POST`.
 *
 * O conteúdo não é buscado aqui: quem baixa é a página, que conhece a aba, e
 * entrega o `Blob` pronto. Tipo que o navegador não desenha (planilha, .docx)
 * fica só com o botão de baixar.
 *
 * No modo avaliação não há prévia nem download — e isso **não é regra de
 * produto**: o backend monta o caminho do arquivo a partir do e-mail do token,
 * então quem avalia procura na própria pasta. Medido em 28/09/2026: consultor
 * pedindo anexo de incubado recebe `404`, e a listagem da aba vem `[]`. Some
 * quando a rota de leitura de anexo alheio existir (`docs/contrato-arquivos.md`).
 */
@Component({
  selector: 'app-visualizador-arquivo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icone],
  templateUrl: './visualizador-arquivo.html',
  styleUrl: './visualizador-arquivo.scss',
  host: {
    '(document:keydown.escape)': 'fechar.emit()',
  },
})
export class VisualizadorArquivo {
  private readonly sanitizer = inject(DomSanitizer);

  private readonly destroyRef = inject(DestroyRef);

  readonly arquivo = input<Anexo | null>(null);
  /** O conteúdo baixado pela página; `null` enquanto não há nada para mostrar. */
  readonly conteudo = input<Blob | null>(null);
  readonly carregando = input(false);
  readonly erro = input('');
  /** Falso no modo avaliação: sem rota para o anexo alheio, não há o que baixar. */
  readonly podeBaixar = input(true);
  readonly baixar = output<void>();
  readonly fechar = output<void>();

  private readonly dialogo = viewChild<ElementRef<HTMLElement>>('dialogo');
  private ultimoFoco: HTMLElement | null = null;

  protected readonly categoria = computed<Categoria>(() => categoriaDe(this.arquivo()));
  protected readonly rotuloTipo = computed(() => ROTULO[this.categoria()]);

  /**
   * `blob:` do conteúdo, criado aqui e devolvido ao fechar. O `<img>` usa a URL
   * crua (o sanitizador do Angular já aceita `blob:`); o `<iframe>` exige a
   * versão marcada como recurso confiável.
   */
  protected readonly url = signal<string | null>(null);
  /** O texto já lido, quando o anexo é um arquivo de texto. */
  protected readonly texto = signal<string | null>(null);

  /** O `blob:` só aparece no `<iframe>` depois de marcado como confiável. */
  protected readonly urlRecurso = computed<SafeResourceUrl | null>(() => {
    const url = this.url();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  /** Há conteúdo baixado e o navegador sabe desenhá-lo? */
  protected readonly temPrevia = computed(
    () => !!this.conteudo() && RENDERIZAVEIS.includes(this.categoria()),
  );

  constructor() {
    // Imagem e PDF viram `blob:`; texto é lido e desenhado como texto, porque
    // num `<iframe>` o navegador aplica o esquema de cor dele e sai preto.
    //
    // O corpo inteiro vai em `untracked`: ele lê e escreve o sinal `url`, e sem
    // isso o efeito passa a depender do que ele mesmo muda — reagenda-se sem
    // parar e congela a aba. Só `conteudo` e `categoria`, lidos acima, disparam.
    effect(() => {
      const conteudo = this.conteudo();
      const categoria = this.categoria();

      untracked(() => {
        this.soltarUrl();
        this.texto.set(null);
        if (!conteudo) {
          return;
        }
        if (categoria === 'texto') {
          void conteudo.text().then((lido) => {
            if (this.conteudo() === conteudo) {
              this.texto.set(lido);
            }
          });
        } else if (categoria === 'imagem' || categoria === 'pdf') {
          this.url.set(URL.createObjectURL(conteudo));
        }
      });
    });

    this.destroyRef.onDestroy(() => this.soltarUrl());

    // Abrir move o foco para o modal; fechar devolve para quem o abriu.
    effect(() => {
      const dialogo = this.dialogo();
      if (this.arquivo() && dialogo) {
        this.ultimoFoco ??= document.activeElement as HTMLElement | null;
        dialogo.nativeElement.focus();
      } else if (!this.arquivo() && this.ultimoFoco) {
        if (this.ultimoFoco.isConnected) {
          this.ultimoFoco.focus();
        }
        this.ultimoFoco = null;
      }
    });
  }

  /** Devolve o `blob:` anterior — sem isto cada abertura vaza um objeto. */
  private soltarUrl(): void {
    const url = this.url();
    if (url) {
      URL.revokeObjectURL(url);
      this.url.set(null);
    }
  }

  /** Prende o Tab dentro do modal, no mesmo padrão dos outros diálogos. */
  protected prenderTab(evento: Event, shift: boolean, dialogo: HTMLElement): void {
    const focaveis = Array.from(
      dialogo.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute('disabled'));
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

  /** Tamanho legível, para o cabeçalho do modal. */
  protected tamanhoLegivel(bytes: number): string {
    return bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

/** Deriva a categoria do MIME e, na falta dele, da extensão do nome. */
function categoriaDe(arquivo: Anexo | null): Categoria {
  if (!arquivo) {
    return 'outro';
  }
  const tipo = (arquivo.tipo || '').toLowerCase();
  const ext = arquivo.nome.split('.').pop()?.toLowerCase() ?? '';
  if (tipo.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
    return 'imagem';
  }
  if (tipo === 'application/pdf' || ext === 'pdf') {
    return 'pdf';
  }
  if (tipo.includes('spreadsheet') || tipo === 'text/csv' || ['xlsx', 'xls', 'csv'].includes(ext)) {
    return 'planilha';
  }
  if (tipo.includes('word') || ['doc', 'docx', 'odt', 'rtf'].includes(ext)) {
    return 'documento';
  }
  if (tipo.startsWith('text/') || ['txt', 'md'].includes(ext)) {
    return 'texto';
  }
  return 'outro';
}
