import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import { APP_ROUTES, ROLE_LABEL, entradaDe } from '../../core/constants/app-constants';
import { Role, SessionUser } from '../../core/models/auth';
import { Auth } from '../../core/services/auth';
import { Icone } from '../../shared/components/icone/icone';
import { Painel, menuPara } from '../../shared/components/painel/painel';

const SUBTITULO: Record<Role, string> = {
  admin: 'Administração da plataforma TecCampos.',
  avaliador: 'Acompanhe os planos de negócio sob sua avaliação.',
  colaborador: 'Acompanhe os planos de negócio da incubadora.',
  incubado: 'Acompanhe o andamento do seu plano de negócios.',
};

/**
 * Visão geral do papel. A sessão já foi checada pelo authGuard; o papel vem
 * de GET /users/me e decide o menu e o texto. Os módulos reais entram depois.
 */
@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Painel, Icone],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** :role da URL (withComponentInputBinding). O servidor é a fonte da verdade. */
  readonly role = input('');

  protected readonly user = signal<SessionUser | null>(null);

  protected readonly roleLabel = computed(() => {
    const user = this.user();
    return user ? ROLE_LABEL[user.role] : '';
  });

  protected readonly subtitulo = computed(() => {
    const user = this.user();
    return user ? SUBTITULO[user.role] : '';
  });

  /** Os itens de menu que ainda não têm endpoint, para o cartão de pendências. */
  protected readonly pendentes = computed(() => {
    const user = this.user();
    return user ? menuPara(user.role).filter((item) => !item.rota) : [];
  });

  /** Horário em que o bearer token expira, formatado para exibição. */
  protected readonly expiraEm = computed(() => {
    // Depende do user() para recalcular quando a sessão carrega.
    if (!this.user()) {
      return '';
    }
    const data = this.auth.expiresAt();
    return data
      ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(data)
      : '';
  });

  ngOnInit(): void {
    this.auth
      .me()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.user.set(user);
          // URL trocada na mão volta para onde o papel entra — e quem avalia
          // não tem painel nenhum. Sem entrada no histórico.
          if (
            this.role() !== user.role ||
            entradaDe(user.role) !== APP_ROUTES.dashboard(user.role)
          ) {
            void this.router.navigate([entradaDe(user.role)], { replaceUrl: true });
          }
        },
        // O 401 já derruba a sessão no error-interceptor; aqui cobre o resto.
        error: () => {
          this.auth.clearSession();
          void this.router.navigate([APP_ROUTES.login]);
        },
      });
  }
}
