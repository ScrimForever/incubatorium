import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FaixaDias } from './faixa-dias';

describe('FaixaDias', () => {
  let fixture: ComponentFixture<FaixaDias>;
  const el = (): HTMLElement => fixture.nativeElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(FaixaDias);
    fixture.componentRef.setInput('dias', [
      {
        data: '2099-01-05',
        rotulo: 'seg, 05/01',
        semana: 'seg',
        numero: '05',
        detalhe: '2 livres',
      },
      { data: '2099-01-06', rotulo: 'ter, 06/01', semana: 'ter', numero: '06', detalhe: '1 livre' },
    ]);
    fixture.componentRef.setInput('selecionado', '2099-01-06');
    fixture.detectChanges();
  });

  it('marca o dia selecionado', () => {
    const dias = el().querySelectorAll('.faixa-dia');
    expect(dias.length).toBe(2);
    expect(dias[1].getAttribute('aria-pressed')).toBe('true');
    expect(dias[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('avisa o dia clicado', () => {
    let escolhido = '';
    fixture.componentInstance.escolher.subscribe((data) => (escolhido = data));
    (el().querySelector('.faixa-dia') as HTMLButtonElement).click();
    expect(escolhido).toBe('2099-01-05');
  });
});
