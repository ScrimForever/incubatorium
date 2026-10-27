import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CalendarioPeriodo, proximaSelecao } from './calendario-periodo';

describe('proximaSelecao', () => {
  it('o primeiro clique escolhe uma data só', () => {
    expect(proximaSelecao('', '', '2026-11-10')).toEqual(['2026-11-10', '']);
  });

  it('o segundo clique fecha o período, em qualquer ordem', () => {
    expect(proximaSelecao('2026-11-10', '', '2026-11-20')).toEqual(['2026-11-10', '2026-11-20']);
    expect(proximaSelecao('2026-11-10', '', '2026-11-03')).toEqual(['2026-11-03', '2026-11-10']);
  });

  it('clicar de novo no mesmo dia mantém a data só', () => {
    expect(proximaSelecao('2026-11-10', '', '2026-11-10')).toEqual(['2026-11-10', '']);
  });

  it('com o período fechado, um clique recomeça', () => {
    expect(proximaSelecao('2026-11-10', '2026-11-20', '2026-11-15')).toEqual(['2026-11-15', '']);
  });
});

describe('CalendarioPeriodo', () => {
  let fixture: ComponentFixture<CalendarioPeriodo>;

  const dias = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.cal-dia'));

  beforeEach(() => {
    fixture = TestBed.createComponent(CalendarioPeriodo);
    fixture.componentRef.setInput('min', '2000-01-01');
    fixture.detectChanges();
  });

  it('dois cliques marcam o período e preenchem de/até', () => {
    dias()[2].click();
    fixture.detectChanges();
    dias()[5].click();
    fixture.detectChanges();

    const componente = fixture.componentInstance;
    expect(componente.de()).toMatch(/-03$/);
    expect(componente.ate()).toMatch(/-06$/);
    expect(dias().filter((d) => d.classList.contains('cal-dia--dentro')).length).toBe(2);
  });

  it('desabilita os dias antes do mínimo', () => {
    fixture.componentRef.setInput('min', '2999-01-01');
    fixture.detectChanges();
    expect(dias().every((d) => d.disabled)).toBeTrue();
  });
});
