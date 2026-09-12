import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { NaoEncontrado } from './nao-encontrado';

describe('NaoEncontrado', () => {
  let fixture: ComponentFixture<NaoEncontrado>;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [NaoEncontrado],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(NaoEncontrado);
  });

  afterEach(() => localStorage.clear());

  function href(): string {
    return fixture.nativeElement.querySelector('a').getAttribute('href');
  }

  it('sem sessão, oferece o login', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Página não encontrada');
    expect(href()).toBe('/login');
  });

  it('com sessão, oferece a volta ao painel', () => {
    localStorage.setItem('bearerToken', 'token-jwt');
    fixture.detectChanges();

    expect(href()).toBe('/minha-conta');
  });
});
