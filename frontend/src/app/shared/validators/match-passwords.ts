import { AbstractControl, ValidationErrors } from '@angular/forms';

/** Exige que os controles `password` e `confirm` do grupo coincidam. */
export function matchPasswordsValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value as string;
  const confirm = group.get('confirm')?.value as string;
  return password && confirm && password !== confirm ? { passwordsMismatch: true } : null;
}
