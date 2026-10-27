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
  const textos = (seletor: string): string[] =>
    Array.from(el().querySelectorAll(seletor)).map((e) => (e.textContent ?? '').trim());

  it('lista um item por dia, com o selo de reservas e o detalhe', () => {
    carregar();
    const dias = textos('.horarios-dia-linha');
    expect(dias.length).toBe(2);
    expect(dias[0]).toContain('1 reservado');
    expect(dias[0]).toContain('2 horários · 1 livre');
    expect(dias[1]).toContain('Sem reserva');
  });

  it('conta os dias em cada filtro e filtra os com reserva', () => {
    carregar();
    expect(textos('.filtro')).toEqual(['Com reserva (1)', 'Sem reserva (1)', 'Todos (2)']);

    (el().querySelectorAll('.filtro')[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(textos('.horarios-dia-linha .lista-titulo').length).toBe(1);
  });

  it('a seta abre as faixas do dia dentro do cartão', () => {
    carregar();
    expect(el().querySelector('.horarios-detalhe')).toBeNull();

    (el().querySelector('.horarios-alternar') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el().querySelector('.horarios-detalhe')).not.toBeNull();
    expect(el().querySelector('.horarios-alternar')?.getAttribute('aria-expanded')).toBe('true');
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

  it('o ícone de calendário mostra o mês, e o dia clicado abre as faixas abaixo', () => {
    carregar();
    (el().querySelector('[aria-label="Ver em calendário"]') as HTMLButtonElement).click();
    (fixture.componentInstance as unknown as { mes: { set(v: string): void } }).mes.set(
      '2099-01-01',
    );
    fixture.detectChanges();

    expect(el().querySelector('.lista')).toBeNull();
    expect(el().querySelector('.horarios-mes-titulo')?.textContent).toContain('Janeiro de 2099');
    const dias = el().querySelectorAll<HTMLButtonElement>('.horarios-mes-casa--agenda');
    expect(dias.length).toBe(2);
    expect(dias[0].classList).toContain('horarios-mes-casa--reservas');

    dias[1].click();
    fixture.detectChanges();
    expect(el().querySelector('.horarios-dia-cartao')?.textContent).toContain('Cancelar dia');
    expect(el().querySelectorAll('.horarios-dia-cartao .horarios-faixa').length).toBe(1);
  });

  it('lembra a visão escolhida na próxima visita', () => {
    carregar();
    (el().querySelector('[aria-label="Ver em calendário"]') as HTMLButtonElement).click();
    expect(localStorage.getItem('meus-horarios:visao')).toBe('calendario');
  });

  it('remarcar fora da faixa não chega ao servidor', () => {
    carregar();
    (el().querySelector('.horarios-alternar') as HTMLButtonElement).click();
    fixture.detectChanges();
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
