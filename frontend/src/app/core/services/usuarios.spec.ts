import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Role } from '../models/auth';
import { UsuarioAdmin, UsuariosService, alteracaoDePapel, papelDe } from './usuarios';

const CONTA: UsuarioAdmin = {
  id: 'abc-123',
  email: 'ana@teccampos.com',
  is_active: true,
  is_superuser: false,
  is_verified: false,
};

describe('papelDe', () => {
  it('prefere o campo role quando ele existe', () => {
    expect(papelDe({ ...CONTA, role: 'avaliador' })).toBe('avaliador');
  });

  it('sem role, superusuário é admin', () => {
    expect(papelDe({ ...CONTA, is_superuser: true })).toBe('admin');
  });

  it('sem role e sem superusuário, cai em incubado — o máximo que a API permite afirmar', () => {
    expect(papelDe(CONTA)).toBe('incubado');
  });
});

describe('alteracaoDePapel', () => {
  it('admin liga o is_superuser, que é o único papel que a API grava', () => {
    expect(alteracaoDePapel('admin')).toEqual({ role: 'admin', is_superuser: true });
  });

  it('os demais papéis desligam o is_superuser', () => {
    for (const papel of ['avaliador', 'colaborador', 'incubado'] as Role[]) {
      expect(alteracaoDePapel(papel)).toEqual({ role: papel, is_superuser: false });
    }
  });
});

describe('UsuariosService', () => {
  let service: UsuariosService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UsuariosService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('lista as contas', () => {
    let recebidas: UsuarioAdmin[] | undefined;
    service.listar().subscribe((contas) => (recebidas = contas));

    const req = backend.expectOne('/api/users');
    expect(req.request.method).toBe('GET');
    req.flush([CONTA]);

    expect(recebidas?.length).toBe(1);
  });

  it('busca uma conta pelo identificador', () => {
    service.buscar('abc-123').subscribe();
    expect(backend.expectOne('/api/users/abc-123').request.method).toBe('GET');
  });

  it('altera só os campos informados', () => {
    service.alterar('abc-123', { is_active: false }).subscribe();

    const req = backend.expectOne('/api/users/abc-123');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ is_active: false });
    req.flush({ ...CONTA, is_active: false });
  });

  it('troca o papel mandando role e is_superuser juntos', () => {
    service.alterar('abc-123', alteracaoDePapel('avaliador')).subscribe();

    const req = backend.expectOne('/api/users/abc-123');
    expect(req.request.body).toEqual({ role: 'avaliador', is_superuser: false });
    req.flush({ ...CONTA, role: 'avaliador' });
  });

  it('exclui a conta', () => {
    service.excluir('abc-123').subscribe();

    const req = backend.expectOne('/api/users/abc-123');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
