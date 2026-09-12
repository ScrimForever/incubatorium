import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { errorInterceptor } from '../../core/interceptors/error-interceptor';
import { Login } from './login';

describe('Login', () => {
  let fixture: ComponentFixture<Login>;
  let backend: HttpTestingController;
  let navegou: jasmine.Spy;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    backend = TestBed.inject(HttpTestingController);
    navegou = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  /** A página é dirigida pelo DOM, como o usuário faria. */
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

  function texto(seletor: string): string {
    return fixture.nativeElement.querySelector(seletor)?.textContent?.trim() ?? '';
  }

  function credenciaisValidas(): void {
    preencher('#login-email', 'usuario@teccampos.com');
    preencher('#login-senha', '12345678');
  }

  it('não chama a API com formulário inválido', () => {
    fixture.detectChanges();
    preencher('#login-email', 'nao-e-email');
    enviar();

    backend.expectNone('/api/auth/jwt/login');
    expect(navegou).not.toHaveBeenCalled();
    expect(texto('.field-error')).toBe('Informe um e-mail válido.');
  });

  it('entra e roteia para o dashboard do papel', () => {
    fixture.detectChanges();
    credenciaisValidas();
    enviar();

    backend
      .expectOne('/api/auth/jwt/login')
      .flush({ access_token: 'token-jwt', token_type: 'bearer' });
    backend.expectOne('/api/users/me').flush({
      id: 'abc',
      email: 'usuario@teccampos.com',
      is_active: true,
      is_superuser: false,
      is_verified: true,
    });

    expect(navegou).toHaveBeenCalledWith(['/dashboard/incubado']);
  });

  it('abre a modal de ativação quando a conta não foi verificada', () => {
    fixture.detectChanges();
    credenciaisValidas();
    enviar();

    backend
      .expectOne('/api/auth/jwt/login')
      .flush({ detail: 'LOGIN_USER_NOT_VERIFIED' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.modal')).not.toBeNull();
    expect(texto('.modal-header h2')).toBe('Conta não ativada');
  });

  it('mostra a mensagem de credencial inválida', () => {
    fixture.detectChanges();
    credenciaisValidas();
    enviar();

    backend
      .expectOne('/api/auth/jwt/login')
      .flush({ detail: 'LOGIN_BAD_CREDENTIALS' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(texto('.error-message')).toBe('E-mail ou senha inválidos.');
    expect(navegou).not.toHaveBeenCalled();
  });
});
