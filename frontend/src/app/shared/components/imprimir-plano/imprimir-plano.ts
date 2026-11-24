import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ApiError } from '../../../core/models/auth';
import { Anexo, JsonQuestionario, NumeroEtapa } from '../../../core/models/questionario';
import { ArquivosService } from '../../../core/services/arquivos';
import { PlanosService } from '../../../core/services/planos';
import { salvarComo } from '../../salvar-como';
import { Icone } from '../icone/icone';
import { PlanoLeitura } from '../plano-leitura/plano-leitura';

/** "Café & Cia." → "cafe-cia": nome de arquivo sem acento nem símbolo. */
function nomeDeArquivo(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'negocio'
  );
}

interface AnexoDaFicha extends Anexo {
  readonly aba: NumeroEtapa;
}

/**
 * Botão Imprimir do plano. Sem anexos, abre direto o diálogo de impressão do
 * navegador (que salva em PDF); com anexos, antes abre uma modal com o PDF do
 * plano e cada arquivo para baixar.
 *
 * O PDF é o próprio navegador: a folha das nove etapas só existe no documento
 * enquanto imprime e, na impressão, o `styles.scss` esconde todo o resto.
 */
@Component({
  selector: 'app-imprimir-plano',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icone, PlanoLeitura],
  templateUrl: './imprimir-plano.html',
  styleUrl: './imprimir-plano.scss',
})
export class ImprimirPlano implements AfterViewInit {
  private readonly arquivos = inject(ArquivosService);
  private readonly destroyRef = inject(DestroyRef);

  readonly json = input.required<JsonQuestionario>();
  /** E-mail do dono do plano quando quem imprime é o avaliador; sem ele, é o logado. */
  readonly dono = input<string | undefined>(undefined);
  /**
   * Com `true` (e `dono`), o plano sai em PDF gerado pelo backend em vez da
   * impressão do navegador — a rota só aceita consultor e coordenação.
   */
  readonly pdfDoServidor = input(false);

  private readonly planos = inject(PlanosService);
  protected readonly gerandoPdf = signal(false);

  protected readonly aberta = signal(false);
  protected readonly imprimindo = signal(false);
  protected readonly baixando = signal<string | null>(null);
  protected readonly erro = signal('');

  protected readonly negocio = computed(() => this.json()['1']?.nome_negocio || 'Negócio sem nome');
  protected readonly proponente = computed(
    () => this.json()['1']?.nome_proponente || 'Proponente não informado',
  );
  protected readonly hoje = new Date().toLocaleDateString('pt-BR');

  protected readonly anexos = computed<AnexoDaFicha[]>(() => [
    ...(this.json()['6']?.arquivos ?? []).map((a) => ({ ...a, aba: 6 as const })),
    ...(this.json()['9']?.arquivos ?? []).map((a) => ({ ...a, aba: 9 as const })),
  ]);

  private readonly folha = viewChild<ElementRef<HTMLElement>>('folha');
  private readonly dialogo = viewChild<ElementRef<HTMLElement>>('dialogo');
  private ultimoFoco: HTMLElement | null = null;

  constructor() {
    // Abrir move o foco para a modal; fechar devolve para o botão.
    effect(() => {
      const dialogo = this.dialogo();
      if (this.aberta() && dialogo) {
        this.ultimoFoco ??= document.activeElement as HTMLElement | null;
        dialogo.nativeElement.focus();
      } else if (!this.aberta() && this.ultimoFoco) {
        if (this.ultimoFoco.isConnected) {
          this.ultimoFoco.focus();
        }
        this.ultimoFoco = null;
      }
    });
  }

  ngAfterViewInit(): void {
    // A folha vai para o <body>: só assim o CSS de impressão consegue esconder o
    // resto da página sem esconder a própria folha.
    const folha = this.folha()?.nativeElement;
    if (folha) {
      document.body.appendChild(folha);
      this.destroyRef.onDestroy(() => folha.remove());
    }
  }

  /** O botão: com anexo abre a modal, sem anexo imprime direto. */
  protected clicar(): void {
    this.erro.set('');
    if (this.anexos().length) {
      this.aberta.set(true);
    } else {
      this.imprimir();
    }
  }

  /** O plano: PDF do backend para quem avalia, impressão do navegador para o resto. */
  protected imprimir(): void {
    const dono = this.dono();
    if (this.pdfDoServidor() && dono) {
      this.baixarPdf(dono);
    } else {
      this.imprimirNoNavegador();
    }
  }

  private baixarPdf(dono: string): void {
    this.gerandoPdf.set(true);
    this.erro.set('');
    this.planos
      .pdf(dono)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (pdf) => {
          this.gerandoPdf.set(false);
          salvarComo(pdf, `plano-${nomeDeArquivo(this.negocio())}.pdf`);
        },
        error: (err: ApiError) => {
          this.gerandoPdf.set(false);
          this.erro.set(err.message);
        },
      });
  }

  protected fechar(): void {
    this.aberta.set(false);
  }

  /** Monta a folha, espera o Angular desenhá-la e chama o diálogo do navegador. */
  private imprimirNoNavegador(): void {
    this.imprimindo.set(true);
    setTimeout(() => {
      window.print();
      this.imprimindo.set(false);
    });
  }

  protected baixar(anexo: AnexoDaFicha): void {
    this.baixando.set(anexo.nome);
    this.erro.set('');
    this.arquivos
      .baixar(anexo.aba, anexo.nome, this.dono())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (conteudo) => {
          this.baixando.set(null);
          salvarComo(conteudo, anexo.nome);
        },
        error: (err: ApiError) => {
          this.baixando.set(null);
          this.erro.set(err.message);
        },
      });
  }

  protected tamanhoLegivel(bytes: number): string {
    return bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** Prende o Tab dentro da modal. O `shift` vem do template. */
  protected prenderTab(evento: Event, shift: boolean, dialogo: HTMLElement): void {
    const focaveis = Array.from(
      dialogo.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
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
}
