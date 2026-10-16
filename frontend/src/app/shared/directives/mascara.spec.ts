import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { Mascara, formatarCnpj, mascararValorSalvo } from './mascara';

describe('formatarCnpj', () => {
  it('monta a máscara completa', () => {
    expect(formatarCnpj('12345678000190')).toBe('12.345.678/0001-90');
  });

  it('formata aos poucos, enquanto se digita', () => {
    expect(formatarCnpj('12')).toBe('12');
    expect(formatarCnpj('123')).toBe('12.3');
    expect(formatarCnpj('123456')).toBe('12.345.6');
    expect(formatarCnpj('123456789')).toBe('12.345.678/9');
    expect(formatarCnpj('1234567800019')).toBe('12.345.678/0001-9');
  });

  it('tira o que não é dígito e corta no décimo quarto', () => {
    expect(formatarCnpj('12.345.678/0001-90 extra 55')).toBe('12.345.678/0001-90');
    expect(formatarCnpj('abc')).toBe('');
  });
});

describe('mascararValorSalvo', () => {
  it('formata o CNPJ gravado sem máscara', () => {
    expect(mascararValorSalvo('cnpj', '12345678000190')).toBe('12.345.678/0001-90');
  });

  it('não apaga texto antigo que não é número', () => {
    expect(mascararValorSalvo('cnpj', 'Não possui')).toBe('Não possui');
  });
});

@Component({
  imports: [ReactiveFormsModule, Mascara],
  template: `<input [formControl]="controle" [appMascara]="mascara" />`,
})
class Hospedeiro {
  controle = new FormControl('', { nonNullable: true });
  mascara: 'cnpj' | null = 'cnpj';
}

describe('Mascara', () => {
  function digitar(valor: string, mascara: 'cnpj' | null = 'cnpj') {
    const fixture = TestBed.createComponent(Hospedeiro);
    fixture.componentInstance.mascara = mascara;
    fixture.detectChanges();
    const campo = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    return { campo, controle: fixture.componentInstance.controle };
  }

  it('formata o campo e o valor do formulário', () => {
    const { campo, controle } = digitar('12345678000190');
    expect(campo.value).toBe('12.345.678/0001-90');
    expect(controle.value).toBe('12.345.678/0001-90');
  });

  it('sem máscara, deixa o valor como veio', () => {
    const { controle } = digitar('qualquer coisa', null);
    expect(controle.value).toBe('qualquer coisa');
  });
});
