import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { APP_ROUTES, MIN_PASSWORD_LENGTH } from '../../core/constants/app-constants';
import { ApiError, SessionUser } from '../../core/models/auth';
import { Auth } from '../../core/services/auth';
import { Icone } from '../../shared/components/icone/icone';
import { Painel } from '../../shared/components/painel/painel';
import { ToggleSenha } from '../../shared/components/toggle-senha/toggle-senha';
import { matchPasswordsValidator } from '../../shared/validators/match-passwords';

/**
 * Dados da conta do próprio usuário, via PATCH /users/me. São dois envios
 * independentes - trocar o e-mail e trocar a senha não têm nada a ver um com
 * o outro, e juntá-los num formulário só obrigaria a digitar a senha à toa.
 */
@Component({
  selector: 'app-minha-conta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Painel, ToggleSenha, Icone],
  templateUrl: './minha-conta.html',
  styleUrl: './minha-conta.scss',
})
export class MinhaConta implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly user = signal<SessionUser | null>(null);
  protected readonly minPassword = MIN_PASSWORD_LENGTH;

  protected readonly salvandoEmail = signal(false);
  protected readonly erroEmail = signal('');
  protected readonly sucessoEmail = signal('');

  protected readonly salvandoSenha = signal(false);
  protected readonly erroSenha = signal('');
  protected readonly sucessoSenha = signal('');
  protected readonly showPassword = signal(false);
  protected readonly showConfirm = signal(false);

  protected readonly formEmail = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly formSenha = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
      confirm: ['', [Validators.required]],
    },
    { validators: matchPasswordsValidator },
  );

  ngOnInit(): void {
    this.auth
      .me()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.user.set(user);
          this.formEmail.patchValue({ email: user.email });
        },
        error: () => {
          this.auth.clearSession();
          void this.router.navigate([APP_ROUTES.login]);
        },
      });
  }

  protected salvarEmail(): void {
    if (this.formEmail.invalid || this.salvandoEmail()) {
      this.formEmail.markAllAsTouched();
      return;
    }
    this.salvandoEmail.set(true);
    this.erroEmail.set('');
    this.sucessoEmail.set('');

    this.auth
      .updateMe({ email: this.formEmail.getRawValue().email })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.salvandoEmail.set(false);
          this.user.set(user);
          this.sucessoEmail.set('E-mail atualizado.');
        },
        error: (err: ApiError) => {
          this.salvandoEmail.set(false);
          this.erroEmail.set(err.message);
        },
      });
  }

  protected salvarSenha(): void {
    if (this.formSenha.invalid || this.salvandoSenha()) {
      this.formSenha.markAllAsTouched();
      return;
    }
    this.salvandoSenha.set(true);
    this.erroSenha.set('');
    this.sucessoSenha.set('');

    this.auth
      .updateMe({ password: this.formSenha.getRawValue().password })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.salvandoSenha.set(false);
          this.formSenha.reset();
          this.sucessoSenha.set('Senha alterada. Use a nova no próximo acesso.');
        },
        error: (err: ApiError) => {
          this.salvandoSenha.set(false);
          this.erroSenha.set(err.message);
        },
      });
  }

  /**
   * "As senhas não conferem" é erro do grupo, não do campo — sem isto o
   * Angular não marca o input, e ele ficaria com a legenda vermelha mas a
   * borda cinza.
   */
  protected senhasDiferentes(): boolean {
    return (
      this.formSenha.errors?.['passwordsMismatch'] === true &&
      this.formSenha.controls.confirm.touched
    );
  }
}
