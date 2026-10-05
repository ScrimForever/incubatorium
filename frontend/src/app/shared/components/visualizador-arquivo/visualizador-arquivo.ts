import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';

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

/**
 * Modal de pré-visualização de anexo — **mock**, por enquanto.
 *
 * O backend ainda não tem rota de download que funcione (o `GET /download` exige
 * corpo num GET; ver `docs/contrato-arquivos.md`), então não há conteúdo real
 * para mostrar. Este modal desenha uma prévia de exemplo conforme o tipo do
 * arquivo, para o fluxo ficar completo na tela; o botão de baixar fica
 * desabilitado até a rota existir.
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
  readonly arquivo = input<Anexo | null>(null);
  readonly fechar = output<void>();

  private readonly dialogo = viewChild<ElementRef<HTMLElement>>('dialogo');
  private ultimoFoco: HTMLElement | null = null;

  protected readonly categoria = computed<Categoria>(() => categoriaDe(this.arquivo()));
  protected readonly rotuloTipo = computed(() => ROTULO[this.categoria()]);

  /** Larguras (%) das linhas fingidas de um documento/PDF. */
  protected readonly linhas: readonly number[] = [92, 78, 96, 64, 88, 40, 90, 72];
  /** Células fingidas de uma planilha. */
  protected readonly tabela: readonly (readonly string[])[] = [
    ['Item', 'Qtde', 'Valor'],
    ['Receita', '120', 'R$ 24.000'],
    ['Custos', '80', 'R$ 12.400'],
    ['Margem', '—', 'R$ 11.600'],
  ];

  constructor() {
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
