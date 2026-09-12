import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { errorInterceptor } from '../../core/interceptors/error-interceptor';
import { Registro } from './registro';

describe('Registro', () => {
  let fixture: ComponentFixture<Registro>;
  let backend: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Registro],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Registro);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  function preencher(seletor: string, valor: string): void {
    const campo: HTMLInputElement = fixture.nativeElement.querySelector(seletor);
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
  }

  function enviar(): void {
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  function cadastro(senha: string, repetir: string): void {
    preencher('#reg-email', 'novo@teccampos.com');
    preencher('#reg-senha', senha);
    preencher('#reg-repetir', repetir);
  }

  it('não envia quando as senhas não conferem', () => {
    cadastro('12345678', '87654321');
    enviar();

    backend.expectNone('/api/auth/register');
    expect(fixture.nativeElement.textContent).toContain('As senhas não conferem.');
  });

  it('não envia com senha curta', () => {
    cadastro('123', '123');
    enviar();

    backend.expectNone('/api/auth/register');
    expect(fixture.nativeElement.textContent).toContain('ao menos 8 caracteres');
  });

  it('abre a modal de ativação depois de cadastrar', () => {
    cadastro('12345678', '12345678');
    enviar();

    const req = backend.expectOne('/api/auth/register');
    expect(req.request.body).toEqual({ email: 'novo@teccampos.com', password: '12345678' });
    req.flush(
      {
        id: 'abc',
        email: 'novo@teccampos.com',
        is_active: false,
        is_superuser: false,
        is_verified: false,
      },
      { status: 201, statusText: 'Created' },
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.modal')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.modal-header h2').textContent.trim()).toBe(
      'Ative sua conta',
    );
  });

  it('mostra o erro de e-mail já cadastrado', () => {
    cadastro('12345678', '12345678');
    enviar();

    backend
      .expectOne('/api/auth/register')
      .flush(
        { detail: 'REGISTER_USER_ALREADY_EXISTS' },
        { status: 400, statusText: 'Bad Request' },
      );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.error-message').textContent).toContain(
      'Este e-mail já está cadastrado.',
    );
  });
});
