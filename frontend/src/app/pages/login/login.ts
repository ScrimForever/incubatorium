import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';

import { APP_ROUTES } from '../../core/constants/app-constants';
import { ApiError } from '../../core/models/auth';
import { Auth } from '../../core/services/auth';
import {
  ActivationModal,
  ActivationModalMode,
} from '../../shared/components/activation-modal/activation-modal';
import { Icone } from '../../shared/components/icone/icone';
import { ToggleSenha } from '../../shared/components/toggle-senha/toggle-senha';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ActivationModal, ToggleSenha, Icone],
  templateUrl: './login.html',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly showPassword = signal(false);

  // Estado da modal de ativação.
  protected readonly modalOpen = signal(false);
  protected readonly modalMode = signal<ActivationModalMode>('nao-ativado');
  protected readonly resending = signal(false);
  protected readonly modalErro = signal('');
  protected readonly modalSucesso = signal('');

  /**
   * O backend responde LOGIN_BAD_CREDENTIALS tanto para senha errada quanto
   * para conta inativa - não dá para afirmar qual foi. Depois de uma recusa,
   * a tela oferece o caminho da ativação em vez de decidir pelo usuário.
   */
  protected readonly ofereceAtivacao = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected enviar(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.errorMessage.set('');
    this.ofereceAtivacao.set(false);

    const { email, password } = this.form.getRawValue();
    this.auth
      .login(email, password)
      .pipe(
        // Autentica e já busca quem é: o papel decide a rota de destino.
        switchMap(() => this.auth.me()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (user) => {
          this.loading.set(false);
          void this.router.navigate([APP_ROUTES.dashboard(user.role)]);
        },
        error: (err: ApiError) => {
          this.loading.set(false);
          if (err.code === 'LOGIN_USER_NOT_VERIFIED') {
            this.abrirAtivacao();
            return;
          }
          this.errorMessage.set(err.message);
          this.ofereceAtivacao.set(err.code === 'LOGIN_BAD_CREDENTIALS');
        },
      });
  }

  protected abrirAtivacao(): void {
    this.modalErro.set('');
    this.modalSucesso.set('');
    this.modalMode.set('nao-ativado');
    this.modalOpen.set(true);
  }

  /** "Reenviar e-mail de ativação": o backend gera um código novo e reenvia. */
  protected onResend(): void {
    this.resending.set(true);
    this.modalErro.set('');
    this.modalSucesso.set('');
    this.auth
      .reenviarCodigo(this.form.getRawValue().email)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.resending.set(false);
          this.modalSucesso.set('Enviamos o e-mail de novo. Confira sua caixa de entrada.');
        },
        error: (err: ApiError) => {
          this.resending.set(false);
          this.modalErro.set(
            err.code === 'ATIVACAO_RECUSADA'
              ? 'Não encontramos uma conta com este e-mail.'
              : err.message,
          );
        },
      });
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
  }
}
