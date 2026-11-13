import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';
import { STORAGE_TOKEN_KEY } from './core/constants/app-constants';

describe('App', () => {
  const raiz = document.documentElement;

  beforeEach(async () => {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    raiz.classList.remove('dentro-do-sistema');
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    raiz.classList.remove('dentro-do-sistema');
  });

  it('sem sessão, a raiz não é marcada: nas telas de entrada a barra não fica reservada', () => {
    TestBed.createComponent(App).detectChanges();
    expect(raiz.classList.contains('dentro-do-sistema')).toBeFalse();
  });

  it('com token, marca a raiz — é o que reserva o lugar da barra dentro do sistema', () => {
    localStorage.setItem(STORAGE_TOKEN_KEY, 'token-de-teste');
    TestBed.createComponent(App).detectChanges();
    expect(raiz.classList.contains('dentro-do-sistema')).toBeTrue();
  });
});
