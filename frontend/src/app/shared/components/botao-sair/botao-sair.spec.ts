import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Auth } from '../../../core/services/auth';
import { BotaoSair } from './botao-sair';

describe('BotaoSair', () => {
  let fixture: ComponentFixture<BotaoSair>;
  let sair: jasmine.Spy;

  const el = (seletor: string) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(seletor);

  beforeEach(async () => {
    sair = jasmine.createSpy('sair');
    await TestBed.configureTestingModule({
      imports: [BotaoSair],
      providers: [{ provide: Auth, useValue: { sair } }],
    }).compileComponents();

    fixture = TestBed.createComponent(BotaoSair);
    fixture.detectChanges();
  });

  it('pede confirmação antes de sair', () => {
    el('.topbar-sair')?.click();
    fixture.detectChanges();

    expect(el('[role="alertdialog"]')).not.toBeNull();
    expect(sair).not.toHaveBeenCalled();
  });

  it('cancelar fecha a modal sem encerrar a sessão', () => {
    el('.topbar-sair')?.click();
    fixture.detectChanges();
    el('.modal .btn-texto')?.click();
    fixture.detectChanges();

    expect(el('[role="alertdialog"]')).toBeNull();
    expect(sair).not.toHaveBeenCalled();
  });

  it('confirmar encerra a sessão', () => {
    el('.topbar-sair')?.click();
    fixture.detectChanges();
    el('.sair-confirmar')?.click();

    expect(sair).toHaveBeenCalled();
  });
});
