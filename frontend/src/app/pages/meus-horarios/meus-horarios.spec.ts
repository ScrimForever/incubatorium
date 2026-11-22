import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Driver } from 'driver.js';

import { errorInterceptor } from '../../core/interceptors/error-interceptor';
import { UserRead } from '../../core/models/auth';
import { Janela } from '../../core/models/consultoria';
import { DRIVER } from '../../core/services/tour';
import { MeusHorarios } from './meus-horarios';

const CONSULTOR: UserRead = {
  id: 'c1',
  email: 'avaliador.teste@teccampos.com',
  is_active: true,
  is_superuser: false,
  is_verified: true,
  is_incubado: false,
  is_admin: false,
  is_consultor: true,
  is_colaborador: false,
};

const horario = (id: number, inicio: string, incubado: string | null = null) => ({
  id,
  janela_id: 1,
  consultor_email: CONSULTOR.email,
  inicio,
  fim: inicio,
  incubado_email: incubado,
  reservado_em: incubado ? '2099-01-01T10:00:00Z' : null,
});

// 2099-01-05 tem uma reserva; 2099-01-06 está toda livre.
const AGENDA: Janela[] = [
  {
    id: 1,
    consultor_email: CONSULTOR.email,
    data: '2099-01-05',
    hora_inicio: '09:00:00',
    hora_fim: '10:30:00',
    duracao_minutos: 45,
    horarios: [
      horario(11, '2099-01-05T12:00:00Z', 'incubado@teccampos.com'),
      horario(12, '2099-01-05T12:45:00Z'),
    ],
  },
  {
    id: 2,
    consultor_email: CONSULTOR.email,
    data: '2099-01-06',
    hora_inicio: '14:00:00',
    hora_fim: '15:00:00',
    duracao_minutos: 60,
    horarios: [horario(21, '2099-01-06T17:00:00Z')],
  },
];

describe('MeusHorarios', () => {
  let fixture: ComponentFixture<MeusHorarios>;
  let backend: HttpTestingController;
  let navegou: jasmine.Spy;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('bearerToken', 'token-jwt');
    // O tour da primeira visita troca a visão; não é o assunto destes testes.
    localStorage.setItem('tour-visto:meus-horarios-calendario', '1');
    await TestBed.configureTestingModule({
      imports: [MeusHorarios],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        // O tour não interessa aqui: um dublê que não desenha nada.
        {
          provide: DRIVER,
          useValue: () =>
            ({ drive: () => undefined, destroy: () => undefined }) as unknown as Driver,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MeusHorarios);
    backend = TestBed.inject(HttpTestingController);
    navegou = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  function carregar(publicadas?: string): void {
    if (publicadas) {
      fixture.componentRef.setInput('publicadas', publicadas);
    }
    fixture.detectChanges();
    backend.expectOne('/api/users/me').flush(CONSULTOR);
    backend.expectOne('/api/consultorias/agenda/minha').flush(AGENDA);
    fixture.detectChanges();
  }

  const el = (): HTMLElement => fixture.nativeElement;

  /** A tela abre direto no calendário do primeiro mês com agenda (desde 04/11/2026). */
  const casas = (): HTMLButtonElement[] =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('.horarios-mes-casa--agenda'));

  function abrirDia(indice: number): void {
    casas()[indice].click();
    fixture.detectChanges();
  }

  it('abre no calendário do primeiro mês com agenda, com os dias marcados', () => {
    carregar();
    expect(el().querySelector('.horarios-mes-titulo')?.textContent).toContain('Janeiro de 2099');
    expect(casas().length).toBe(2);
    expect(casas()[0].classList).toContain('horarios-mes-casa--reservas');
    expect(casas()[0].textContent).toContain('1 de 2 reservados');
    expect(casas()[1].textContent).toContain('1 livres');
    expect(el().querySelector('#horarios-dia-escolhido')).toBeNull();
  });

  it('o dia clicado abre as faixas abaixo da grade, e o segundo clique fecha', () => {
    carregar();
    abrirDia(1);
    const dia = el().querySelector('#horarios-dia-escolhido');
    expect(dia?.textContent).toContain('Cancelar dia');
    expect(dia?.textContent).toContain('Sem reserva');
    expect(el().querySelectorAll('#horarios-dia-escolhido .horarios-faixa').length).toBe(1);

    abrirDia(1);
    expect(el().querySelector('#horarios-dia-escolhido')).toBeNull();
  });

  it('as setas trocam o mês, e mês sem agenda diz isso', () => {
    carregar();
    (el().querySelector('[aria-label="Próximo mês"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el().querySelector('.horarios-mes-titulo')?.textContent).toContain('Fevereiro de 2099');
    expect(casas().length).toBe(0);
    expect(el().querySelector('.horarios-mes-vazio')?.textContent).toContain(
      'Nenhum dia da agenda neste mês.',
    );
  });

  it('vindo de Abrir agenda, avisa o sucesso e tira o parâmetro da URL', () => {
    carregar('3');
    expect(el().querySelector('.success-message')?.textContent).toContain(
      'Agenda aberta em 3 dias',
    );
    expect(navegou).toHaveBeenCalledWith(
      [],
      jasmine.objectContaining({ queryParams: { publicadas: null }, replaceUrl: true }),
    );
  });

  it('remarcar fora da faixa não chega ao servidor', () => {
    carregar();
    abrirDia(0);
    (el().querySelector('.horarios-chip-acao') as HTMLButtonElement).click();
    fixture.detectChanges();

    const fim = el().querySelector('#re-fim') as HTMLInputElement;
    fim.value = '11:00';
    fim.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(el().querySelector('.modal')?.textContent).toContain('A faixa termina às 10:30.');
    (el().querySelector('.modal-footer .btn--azul') as HTMLButtonElement).click();
    backend.expectNone('/api/consultorias/horarios/11');
  });
});
