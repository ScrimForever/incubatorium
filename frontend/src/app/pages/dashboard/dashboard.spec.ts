import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { errorInterceptor } from '../../core/interceptors/error-interceptor';
import { UserRead } from '../../core/models/auth';
import { Dashboard } from './dashboard';

const COMUM: UserRead = {
  id: '4760ae6f-a24d-446a-b589-b2a0fc8c101b',
  email: 'usuario@teccampos.com',
  is_active: true,
  is_superuser: false,
  is_verified: true,
};

describe('Dashboard', () => {
  let fixture: ComponentFixture<Dashboard>;
  let backend: HttpTestingController;
  let navegou: jasmine.Spy;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('bearerToken', 'token-jwt');
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Dashboard);
    backend = TestBed.inject(HttpTestingController);
    navegou = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  /** Carrega a página com o :role informado e responde o /users/me. */
  function carregar(role: string, user: UserRead = COMUM): void {
    fixture.componentRef.setInput('role', role);
    fixture.detectChanges();
    backend.expectOne('/api/users/me').flush(user);
    fixture.detectChanges();
  }

  it('mostra a conta e o papel vindos da API', () => {
    carregar('incubado');
    const texto = fixture.nativeElement.textContent;

    expect(texto).toContain('usuario@teccampos.com');
    expect(texto).toContain('Incubado');
    expect(texto).toContain(COMUM.id);
    expect(navegou).not.toHaveBeenCalled();
  });

  it('lista os módulos que ainda dependem do backend', () => {
    carregar('incubado');
    const itens: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.dash-pendentes li'),
    );

    // Meu plano saiu da lista: o módulo já existe (contra o mock de dev).
    expect(itens.length).toBe(2);
    expect(itens.map((li) => li.textContent)).toContain(jasmine.stringContaining('Equipe'));
  });

  it('corrige a URL quando o papel não bate com o do servidor', () => {
    carregar('admin');

    expect(navegou).toHaveBeenCalledWith(['/dashboard/incubado'], { replaceUrl: true });
  });

  it('reconhece o superusuário como admin', () => {
    carregar('admin', { ...COMUM, is_superuser: true });

    expect(fixture.nativeElement.textContent).toContain('Administrador');
    expect(navegou).not.toHaveBeenCalled();
  });
});
