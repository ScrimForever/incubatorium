import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { MIN_PASSWORD_LENGTH } from '../../core/constants/app-constants';
import { ApiError } from '../../core/models/auth';
import { Auth } from '../../core/services/auth';
import { Icone } from '../../shared/components/icone/icone';
import { ToggleSenha } from '../../shared/components/toggle-senha/toggle-senha';
import { matchPasswordsValidator } from '../../shared/validators/match-passwords';

/**
 * Destino do link enviado por e-mail: /redefinir-senha?token=...
 * O token é validado pela API no envio - aqui só se confere se ele existe.
 */
@Component({
  selector: 'app-redefinir-senha',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ToggleSenha, Icone],
  templateUrl: './redefinir-senha.html',
})
export class RedefinirSenha {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly destroyRef = inject(DestroyRef);

  /** ?token=... da query string (withComponentInputBinding no app.config). */
  readonly token = input('');

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly redefinida = signal(false);
  protected readonly minPassword = MIN_PASSWORD_LENGTH;
  protected readonly showPassword = signal(false);
  protected readonly showConfirm = signal(false);

  protected readonly form = this.fb.nonNullable.group(
    {
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

    this.auth
      .resetPassword(this.token(), this.form.getRawValue().password)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.redefinida.set(true);
        },
        error: (err: ApiError) => {
          this.loading.set(false);
          this.errorMessage.set(err.message);
        },
      });
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
