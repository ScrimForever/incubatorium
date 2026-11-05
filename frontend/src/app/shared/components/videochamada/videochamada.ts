import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { Horario } from '../../../core/models/consultoria';
import { JitsiApi } from '../../../core/models/videochamada';
import { Participante, VideochamadaService } from '../../../core/services/videochamada';
import { Icone } from '../icone/icone';

/**
 * Videochamada da consultoria em tela cheia, sobre a página. O Jitsi desenha
 * num iframe dentro do palco; fechar desliga e desmonta a chamada.
 */
@Component({
  selector: 'app-videochamada',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icone],
  templateUrl: './videochamada.html',
  styleUrl: './videochamada.scss',
  host: { '(document:keydown.escape)': 'fechar()' },
})
export class Videochamada {
  private readonly service = inject(VideochamadaService);

  readonly horario = input.required<Horario>();
  readonly participante = input.required<Participante>();
  readonly titulo = input('Videochamada');
  readonly encerrada = output<void>();

  protected readonly erro = signal('');
  private readonly palco = viewChild.required<ElementRef<HTMLElement>>('palco');
  private api: JitsiApi | null = null;
  private destruido = false;

  constructor() {
    // O iframe precisa do elemento no DOM: só depois do primeiro desenho.
    afterNextRender(() => this.iniciar());
    inject(DestroyRef).onDestroy(() => {
      this.destruido = true;
      this.api?.dispose();
    });
  }

  protected fechar(): void {
    this.api?.dispose();
    this.api = null;
    this.encerrada.emit();
  }

  private iniciar(): void {
    this.service
      .abrir(this.palco().nativeElement, this.horario(), this.participante(), () => this.fechar())
      .then((api) => {
        // Fechou antes de o script chegar: não deixa chamada órfã.
        if (this.destruido) {
          api.dispose();
        } else {
          this.api = api;
        }
      })
      .catch(() =>
        this.erro.set('Não foi possível abrir a videochamada. Confira a conexão e tente de novo.'),
      );
  }
}
