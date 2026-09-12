import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ApiError } from '../../core/models/auth';
import { Auth } from '../../core/services/auth';
import { Icone } from '../../shared/components/icone/icone';

/**
 * Pedido de redefinição de senha. A API responde 202 tanto para e-mail
 * cadastrado quanto para desconhecido - de propósito, para não revelar quem
 * tem conta. A tela diz a mesma coisa nos dois casos.
 */
@Component({
  selector: 'app-esqueci-senha',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, Icone],
  templateUrl: './esqueci-senha.html',
})
export class EsqueciSenha {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly enviado = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected enviar(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.errorMessage.set('');

    this.auth
      .forgotPassword(this.form.getRawValue().email)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.enviado.set(true);
        },
        error: (err: ApiError) => {
          this.loading.set(false);
          this.errorMessage.set(err.message);
        },
      });
  }
}
