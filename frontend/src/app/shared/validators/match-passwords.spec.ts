import { FormBuilder } from '@angular/forms';

import { matchPasswordsValidator } from './match-passwords';

describe('matchPasswordsValidator', () => {
  const fb = new FormBuilder();

  const grupo = (password: string, confirm: string) =>
    fb.nonNullable.group(
      { password: [password], confirm: [confirm] },
      {
        validators: matchPasswordsValidator,
      },
    );

  it('aceita senhas iguais', () => {
    expect(grupo('12345678', '12345678').errors).toBeNull();
  });

  it('acusa senhas diferentes', () => {
    expect(grupo('12345678', '87654321').errors).toEqual({ passwordsMismatch: true });
  });

  it('não acusa enquanto a confirmação está vazia', () => {
    expect(grupo('12345678', '').errors).toBeNull();
  });
});
