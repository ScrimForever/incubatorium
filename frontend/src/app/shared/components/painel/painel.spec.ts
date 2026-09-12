import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { SessionUser } from '../../../core/models/auth';
import { Painel } from './painel';

const INCUBADO: SessionUser = {
  id: 'abc',
  email: 'usuario@teccampos.com',
  is_active: true,
  is_superuser: false,
  is_verified: true,
  role: 'incubado',
};

describe('Painel', () => {
  let fixture: ComponentFixture<Painel>;
  let backend: HttpTestingController;
  let navegou: jasmine.Spy;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('bearerToken', 'token-jwt');
    await TestBed.configureTestingModule({
      imports: [Painel],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Painel);
    backend = TestBed.inject(HttpTestingController);
    navegou = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  function montar(user: SessionUser, ativo = 'Visão geral'): void {
    fixture.componentRef.setInput('user', user);
    fixture.componentRef.setInput('ativo', ativo);
    fixture.detectChanges();
  }

  function itens(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.painel-menu-item'));
  }

  it('monta o menu do papel, com os módulos prontos navegáveis', () => {
    montar(INCUBADO);
    const rotulos = itens().map((item) => item.textContent?.trim());

    expect(rotulos).toEqual(['Visão geral', 'Meu plano', 'Equipe', 'Agenda', 'Minha conta']);
    // Visão geral, Meu plano e Minha conta já têm endpoint; os demais, não.
    expect(itens().filter((item) => item.tagName === 'A').length).toBe(3);
  });

  it('mostra os módulos sem endpoint como botão desabilitado com o motivo', () => {
    montar(INCUBADO);
    const equipe = itens().find((item) => item.textContent?.includes('Equipe'));

    expect(equipe?.tagName).toBe('BUTTON');
    expect((equipe as HTMLButtonElement).disabled).toBeTrue();
    expect(equipe?.getAttribute('title')).toContain('membros');
  });

  it('marca como atual só o item da página', () => {
    montar(INCUBADO, 'Minha conta');
    const atuais = itens().filter((item) => item.getAttribute('aria-current') === 'page');

    expect(atuais.length).toBe(1);
    expect(atuais[0].textContent?.trim()).toBe('Minha conta');
  });

  it('troca o menu conforme o papel', () => {
    montar({ ...INCUBADO, is_superuser: true, role: 'admin' });
    const rotulos = itens().map((item) => item.textContent?.trim());

    expect(rotulos).toContain('Práticas chaves');
    expect(rotulos).not.toContain('Meu plano');
  });

  it('sair encerra a sessão na API e volta ao login', () => {
    montar(INCUBADO);
    fixture.nativeElement.querySelector('.topbar-sair').click();

    backend
      .expectOne('/api/auth/jwt/logout')
      .flush(null, { status: 204, statusText: 'No Content' });

    expect(localStorage.getItem('bearerToken')).toBeNull();
    expect(navegou).toHaveBeenCalledWith(['/login']);
  });
});
