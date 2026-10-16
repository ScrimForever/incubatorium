import { Directive, inject, input } from '@angular/core';
import { NgControl } from '@angular/forms';

/** As máscaras conhecidas. Máscara nova = formatador novo em `FORMATADORES`. */
export type MascaraNome = 'cnpj';

/** 00.000.000/0000-00, montado à medida que se digita; o que não é dígito sai. */
export function formatarCnpj(valor: string): string {
  return valor
    .replace(/\D/g, '')
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

const FORMATADORES: Record<MascaraNome, (valor: string) => string> = {
  cnpj: formatarCnpj,
};

/**
 * O valor já gravado, formatado para exibir. Só formata o que parece número:
 * um texto antigo como "Não possui" não pode sumir só por abrir a etapa.
 */
export function mascararValorSalvo(nome: MascaraNome, valor: string): string {
  return /^[\d\s./-]*$/.test(valor) ? FORMATADORES[nome](valor) : valor;
}

/**
 * Aplica a máscara enquanto a pessoa digita ou cola, sem perder a posição do
 * cursor. Com `null`, não faz nada: assim o mesmo `@for` de campos serve para
 * quem tem e quem não tem máscara.
 */
@Directive({
  selector: '[appMascara]',
  host: { '(input)': 'aoDigitar($event)' },
})
export class Mascara {
  readonly appMascara = input<MascaraNome | null>(null);
  private readonly controle = inject(NgControl, { optional: true, self: true });

  protected aoDigitar(evento: Event): void {
    const nome = this.appMascara();
    const campo = evento.target as HTMLInputElement;
    if (!nome) {
      return;
    }
    const formatado = FORMATADORES[nome](campo.value);
    if (formatado === campo.value) {
      return;
    }
    // O cursor fica depois do mesmo número de dígitos de antes da formatação.
    const digitosAntes = campo.value.slice(0, campo.selectionStart ?? 0).replace(/\D/g, '').length;
    campo.value = formatado;
    this.controle?.control?.setValue(formatado);
    const posicao = posicaoDepoisDe(formatado, digitosAntes);
    campo.setSelectionRange(posicao, posicao);
  }
}

/** A posição no texto formatado logo depois do n-ésimo dígito. */
function posicaoDepoisDe(texto: string, digitos: number): number {
  if (digitos === 0) {
    return 0;
  }
  let vistos = 0;
  for (let i = 0; i < texto.length; i++) {
    if (/\d/.test(texto[i]) && ++vistos === digitos) {
      return i + 1;
    }
  }
  return texto.length;
}
