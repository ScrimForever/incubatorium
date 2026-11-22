import { FormControl } from '@angular/forms';

import { cnpjValidator, cnpjValido } from './cnpj';

describe('cnpjValidator', () => {
  const erro = (valor: string) => cnpjValidator(new FormControl(valor));

  it('aceita vazio (o campo é opcional)', () => {
    expect(erro('')).toBeNull();
  });

  it('aceita CNPJ válido, com ou sem máscara', () => {
    expect(erro('11.222.333/0001-81')).toBeNull();
    expect(cnpjValido('11222333000181')).toBeTrue();
  });

  it('recusa CNPJ incompleto', () => {
    expect(erro('12.3')).toEqual({ cnpj: true });
  });

  it('recusa dígito verificador errado e sequência repetida', () => {
    expect(erro('11.222.333/0001-82')).toEqual({ cnpj: true });
    expect(erro('11.111.111/1111-11')).toEqual({ cnpj: true });
  });
});
