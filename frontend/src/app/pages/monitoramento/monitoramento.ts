import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';

import { APP_ROUTES, MONITORAMENTO_POWERBI_URL } from '../../core/constants/app-constants';
import { SessionUser } from '../../core/models/auth';
import { Auth } from '../../core/services/auth';
import { Painel } from '../../shared/components/painel/painel';

/**
 * Monitoramento dos incubados aprovados. Por enquanto só abre o painel Power BI
 * do sistema antigo — em nova aba ou embutido aqui — até o módulo ter dados na API.
 */
@Component({
  selector: 'app-monitoramento',
  imports: [Painel],
  templateUrl: './monitoramento.html',
  styleUrl: './monitoramento.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Monitoramento implements OnInit {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly user = signal<SessionUser | null>(null);
  protected readonly embutido = signal(true);
  protected readonly url = MONITORAMENTO_POWERBI_URL;
  // URL fixa, escrita no código: confiar nela é seguro, e o iframe exige.
  protected readonly urlSegura =
    inject(DomSanitizer).bypassSecurityTrustResourceUrl(MONITORAMENTO_POWERBI_URL);

  ngOnInit(): void {
    this.auth
      .me()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (u) => this.user.set(u),
        error: () => {
          this.auth.clearSession();
          void this.router.navigate([APP_ROUTES.login]);
        },
      });
  }

  protected alternar(): void {
    this.embutido.update((v) => !v);
  }
}
