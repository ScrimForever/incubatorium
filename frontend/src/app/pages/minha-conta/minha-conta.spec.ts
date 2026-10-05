import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { errorInterceptor } from '../../core/interceptors/error-interceptor';
import { UserRead } from '../../core/models/auth';
import { MinhaConta } from './minha-conta';

const USUARIO: UserRead = {
  id: 'abc',
  email: 'usuario@teccampos.com',
  is_active: true,
  is_superuser: false,
  is_verified: true,
};

describe('MinhaConta', () => {
  let fixture: ComponentFixture<MinhaConta>;
  let backend: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('bearerToken', 'token-jwt');
    await TestBed.configureTestingModule({
      imports: [MinhaConta],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MinhaConta);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    backend.expectOne('/api/users/me').flush(USUARIO);
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

  /** 0 = formulário de e-mail, 1 = formulário de senha. */
  function enviar(indice: number): void {
    const forms: HTMLFormElement[] = Array.from(fixture.nativeElement.querySelectorAll('form'));
    forms[indice].dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  it('chega com o e-mail atual preenchido', () => {
    const campo: HTMLInputElement = fixture.nativeElement.querySelector('#conta-email');
    expect(campo.value).toBe('usuario@teccampos.com');
  });

  it('avisa que o e-mail novo terá de ser confirmado', () => {
    expect(fixture.nativeElement.querySelector('.conta-aviso').textContent).toContain(
      'precisa ser confirmado',
    );
  });

  it('salva o e-mail novo com PATCH', () => {
    preencher('#conta-email', 'outro@teccampos.com');
    enviar(0);

    const req = backend.expectOne('/api/users/me');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ email: 'outro@teccampos.com' });
    req.flush({ ...USUARIO, email: 'outro@teccampos.com', is_verified: false });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.success-message').textContent).toContain(
      'E-mail atualizado.',
    );
  });

  it('manda só a senha no PATCH de senha', () => {
    preencher('#conta-senha', 'senhanova123');
    preencher('#conta-senha-repetir', 'senhanova123');
    enviar(1);

    const req = backend.expectOne('/api/users/me');
    expect(req.request.body).toEqual({ password: 'senhanova123' });
    req.flush(USUARIO);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Senha alterada.');
  });

  it('não envia senha quando a repetição não confere', () => {
    preencher('#conta-senha', 'senhanova123');
    preencher('#conta-senha-repetir', 'outracoisa123');
    enviar(1);

    backend.expectNone('/api/users/me');
    expect(fixture.nativeElement.textContent).toContain('As senhas não conferem.');
  });
});
