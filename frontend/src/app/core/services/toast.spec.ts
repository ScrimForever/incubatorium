import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import { ToastService } from './toast';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    service = TestBed.inject(ToastService);
  });

  it('mostra o aviso e o tira sozinho depois de 4 s', fakeAsync(() => {
    service.sucesso('Usuário salvo.');
    expect(service.itens().map((t) => t.mensagem)).toEqual(['Usuário salvo.']);
    tick(4000);
    expect(service.itens()).toEqual([]);
  }));

  it('fecha um aviso pelo id, sem mexer nos outros', fakeAsync(() => {
    service.sucesso('Um');
    service.sucesso('Dois');
    service.fechar(service.itens()[0].id);
    expect(service.itens().map((t) => t.mensagem)).toEqual(['Dois']);
    tick(4000);
  }));
});
