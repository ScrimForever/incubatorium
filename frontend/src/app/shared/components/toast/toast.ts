import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ToastService } from '../../../core/services/toast';
import { Icone } from '../icone/icone';

/** Pilha de avisos no canto da tela; o leitor de tela ouve pelo `role="status"`. */
@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icone],
  templateUrl: './toast.html',
  styleUrl: './toast.scss',
})
export class Toast {
  protected readonly toast = inject(ToastService);
}
