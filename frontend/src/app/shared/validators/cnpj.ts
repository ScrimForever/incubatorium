import { AbstractControl, ValidationErrors } from '@angular/forms';

/** Dígito verificador do CNPJ para os `base` primeiros dígitos (pesos 2..9 da direita). */
function digito(numeros: number[]): number {
  let soma = 0;
  let peso = 2;
  for (let i = numeros.length - 1; i >= 0; i--) {
    soma += numeros[i] * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Confere 14 dígitos e os dois verificadores. Aceita com ou sem máscara. */
export function cnpjValido(valor: string): boolean {
  const so = valor.replace(/\D/g, '');
  if (so.length !== 14 || /^(\d)\1{13}$/.test(so)) {
    return false;
  }
  const numeros = [...so].map(Number);
  const primeiro = digito(numeros.slice(0, 12));
  const segundo = digito([...numeros.slice(0, 12), primeiro]);
  return numeros[12] === primeiro && numeros[13] === segundo;
}

/** Campo vazio passa (CNPJ é opcional); preenchido, tem de ser um CNPJ válido. */
export function cnpjValidator(control: AbstractControl): ValidationErrors | null {
  const valor = String(control.value ?? '').trim();
  return valor && !cnpjValido(valor) ? { cnpj: true } : null;
}
