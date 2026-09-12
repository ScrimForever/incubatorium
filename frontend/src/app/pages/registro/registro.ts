import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { APP_ROUTES, MIN_PASSWORD_LENGTH } from '../../core/constants/app-constants';
import { ApiError } from '../../core/models/auth';
import { Auth } from '../../core/services/auth';
import { ActivationModal } from '../../shared/components/activation-modal/activation-modal';
import { Icone } from '../../shared/components/icone/icone';
import { ToggleSenha } from '../../shared/components/toggle-senha/toggle-senha';
import { matchPasswordsValidator } from '../../shared/validators/match-passwords';

@Component({
  selector: 'app-registro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ActivationModal, ToggleSenha, Icone],
  templateUrl: './registro.html',
})
export class Registro {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly minPassword = MIN_PASSWORD_LENGTH;
  protected readonly showPassword = signal(false);
  protected readonly showConfirm = signal(false);

  // Modal de ativação: a conta nasce inativa e o link vai por e-mail.
  protected readonly modalOpen = signal(false);
  protected readonly resending = signal(false);
  protected readonly modalErro = signal('');
  protected readonly modalSucesso = signal('');

  protected readonly form = this.fb.nonNullable.group(
    {
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
      confirm: ['', [Validators.required]],
    },
    { validators: matchPasswordsValidator },
  );

  protected enviar(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.errorMessage.set('');

    const { email, password } = this.form.getRawValue();
    this.auth
      .register(email, password)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loading.set(false);
          // Conta criada inativa: a modal informa e oferece o reenvio.
          this.modalOpen.set(true);
        },
        error: (err: ApiError) => {
          this.loading.set(false);
          this.errorMessage.set(err.message);
        },
      });
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
          this.modalErro.set(err.message);
        },
      });
  }

  /** Fechar a modal leva ao login - próxima etapa natural do fluxo. */
  protected closeModal(): void {
    this.modalOpen.set(false);
    void this.router.navigate([APP_ROUTES.login]);
  }

  /**
   * "As senhas não conferem" é erro do grupo, não do campo — sem isto o
   * Angular não marca o input, e ele ficaria com a legenda vermelha mas a
   * borda cinza.
   */
  protected senhasDiferentes(): boolean {
    return this.form.errors?.['passwordsMismatch'] === true && this.form.controls.confirm.touched;
  }
}
