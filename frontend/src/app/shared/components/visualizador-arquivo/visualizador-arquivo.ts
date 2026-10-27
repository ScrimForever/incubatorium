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
import { lerCsv } from '../../csv';
import { Icone } from '../icone/icone';

/** Categorias que ganham uma pré-visualização própria. */
type Categoria = 'imagem' | 'pdf' | 'csv' | 'planilha' | 'documento' | 'texto' | 'outro';

const ROTULO: Record<Categoria, string> = {
  imagem: 'Imagem',
  pdf: 'Documento PDF',
  csv: 'Planilha CSV',
  planilha: 'Planilha',
  documento: 'Documento de texto',
  texto: 'Arquivo de texto',
  outro: 'Arquivo',
};

/** As categorias que o navegador desenha sozinho a partir de um `blob:`. */
const RENDERIZAVEIS: readonly Categoria[] = ['imagem', 'pdf', 'csv', 'texto'];

/** Teto de linhas da tabela: a prévia é para conferir, o arquivo inteiro vem no "Baixar". */
export const MAXIMO_LINHAS_CSV = 200;

/**
 * Modal de pré-visualização de anexo. O conteúdo não é buscado aqui: a página,
 * que conhece a aba, baixa e entrega o `Blob` pronto. Tipo que o navegador não
 * desenha (.xlsx, .docx) fica só com o botão de baixar; CSV vira tabela.
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
  readonly baixar = output<void>();
  readonly fechar = output<void>();

  private readonly dialogo = viewChild<ElementRef<HTMLElement>>('dialogo');
  private ultimoFoco: HTMLElement | null = null;

  protected readonly categoria = computed<Categoria>(() => categoriaDe(this.arquivo()));
  protected readonly rotuloTipo = computed(() => ROTULO[this.categoria()]);

  /**
   * `blob:` do conteúdo, criado aqui e devolvido ao fechar. O `<img>` usa a URL
   * crua; o `<iframe>` exige a versão marcada como recurso confiável.
   */
  protected readonly url = signal<string | null>(null);
  /** O texto já lido, quando o anexo é um arquivo de texto. */
  protected readonly texto = signal<string | null>(null);
  /** As linhas do CSV já lidas; a primeira é o cabeçalho. */
  private readonly tabela = signal<string[][] | null>(null);

  protected readonly cabecalhoCsv = computed(() => this.tabela()?.[0] ?? []);
  protected readonly linhasCsv = computed(
    () => this.tabela()?.slice(1, MAXIMO_LINHAS_CSV + 1) ?? [],
  );
  /** Quantas linhas ficaram fora da tabela, para a prévia não esconder isso. */
  protected readonly linhasOcultasCsv = computed(() =>
    Math.max(0, (this.tabela()?.length ?? 0) - 1 - MAXIMO_LINHAS_CSV),
  );

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
    // Imagem e PDF viram `blob:`; texto é desenhado como texto, porque num
    // `<iframe>` o navegador aplica o esquema de cor dele e sai preto.
    // O corpo vai em `untracked` porque lê e escreve `url`: sem isso o efeito
    // depende do que ele mesmo muda e se reagenda sem parar.
    effect(() => {
      const conteudo = this.conteudo();
      const categoria = this.categoria();

      untracked(() => {
        this.soltarUrl();
        this.texto.set(null);
        this.tabela.set(null);
        if (!conteudo) {
          return;
        }
        if (categoria === 'texto' || categoria === 'csv') {
          void conteudo.text().then((lido) => {
            if (this.conteudo() !== conteudo) {
              return;
            }
            if (categoria === 'csv') {
              this.tabela.set(lerCsv(lido));
            } else {
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
  // Antes de `text/`: o CSV é texto, mas é desenhado como tabela.
  if (tipo === 'text/csv' || ext === 'csv') {
    return 'csv';
  }
  if (tipo.includes('spreadsheet') || ['xlsx', 'xls'].includes(ext)) {
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
