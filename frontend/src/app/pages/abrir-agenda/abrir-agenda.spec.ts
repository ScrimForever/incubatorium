import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Driver } from 'driver.js';

import { errorInterceptor } from '../../core/interceptors/error-interceptor';
import { UserRead } from '../../core/models/auth';
import { Janela } from '../../core/models/consultoria';
import { DRIVER } from '../../core/services/tour';
import { AbrirAgenda } from './abrir-agenda';

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

/** Já existe agenda das 10:00 às 11:00 em 05/01/2099. */
const PUBLICADA: Janela = {
  id: 1,
  consultor_email: CONSULTOR.email,
  data: '2099-01-05',
  hora_inicio: '10:00:00',
  hora_fim: '11:00:00',
  duracao_minutos: 60,
  horarios: [],
};

/** O que o teste mexe na tela sem passar pelo calendário. */
interface Tela {
  de: { set(v: string): void };
  ate: { set(v: string): void };
  adicionarDatas(): void;
  tirarDaPrevia(indice: number, inicio: string): void;
}

describe('AbrirAgenda', () => {
  let fixture: ComponentFixture<AbrirAgenda>;
  let backend: HttpTestingController;
  let navegou: jasmine.Spy;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('bearerToken', 'token-jwt');
    await TestBed.configureTestingModule({
      imports: [AbrirAgenda],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        {
          provide: DRIVER,
          useValue: () =>
            ({ drive: () => undefined, destroy: () => undefined }) as unknown as Driver,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AbrirAgenda);
    backend = TestBed.inject(HttpTestingController);
    navegou = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture.detectChanges();
    backend.expectOne('/api/users/me').flush(CONSULTOR);
    backend.expectOne('/api/consultorias/agenda/minha').flush([PUBLICADA]);
    fixture.detectChanges();
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  const el = (): HTMLElement => fixture.nativeElement;
  const tela = (): Tela => fixture.componentInstance as unknown as Tela;
  const publicar = (): HTMLButtonElement =>
    el().querySelector('.horarios-rodape .btn--azul') as HTMLButtonElement;
  const pendencia = (): string =>
    el().querySelector('.horarios-pendencia')?.textContent?.trim() ?? '';

  function escolher(de: string, ate = ''): void {
    tela().de.set(de);
    tela().ate.set(ate);
    tela().adicionarDatas();
    fixture.detectChanges();
  }

  it('sem data, o Publicar fica bloqueado e diz o motivo', () => {
    expect(publicar().disabled).toBeTrue();
    expect(pendencia()).toBe('Adicione ao menos uma data.');
  });

  it('avisa antes de publicar uma faixa que se sobrepõe à agenda do dia', () => {
    escolher('2099-01-05');
    expect(pendencia()).toContain('você já atende das 10:00 às 11:00');
    expect(publicar().disabled).toBeTrue();
  });

  it('publica as datas do período e volta para a lista com o aviso', () => {
    // 07/01/2099 é quarta; segunda a sexta até sábado dá quarta, quinta e sexta.
    escolher('2099-01-07', '2099-01-10');
    publicar().click();

    const req = backend.expectOne('/api/consultorias/agenda');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      datas: ['2099-01-07', '2099-01-08', '2099-01-09'],
      blocos: [{ hora_inicio: '09:00', hora_fim: '12:00', duracao_minutos: 45 }],
    });
    req.flush([]);
    expect(navegou).toHaveBeenCalledWith(['/meus-horarios'], {
      queryParams: { publicadas: 3 },
    });
  });

  it('horário tirado da prévia vai como faixa partida', () => {
    escolher('2099-01-07');
    tela().tirarDaPrevia(0, '09:45');
    fixture.detectChanges();
    publicar().click();

    const req = backend.expectOne('/api/consultorias/agenda');
    expect(req.request.body.blocos).toEqual([
      { hora_inicio: '09:00', hora_fim: '09:45', duracao_minutos: 45 },
      { hora_inicio: '10:30', hora_fim: '12:00', duracao_minutos: 45 },
    ]);
    req.flush([]);
  });

  it('recusa do servidor fica na tela, sem sair dela', () => {
    escolher('2099-01-07');
    publicar().click();
    backend
      .expectOne('/api/consultorias/agenda')
      .flush(
        { detail: [{ type: 'value_error', msg: 'Value error, Há datas repetidas.' }] },
        { status: 422, statusText: 'Unprocessable' },
      );
    fixture.detectChanges();

    expect(el().querySelector('.error-message')?.textContent).toContain('Há datas repetidas.');
    expect(navegou).not.toHaveBeenCalled();
  });
});
