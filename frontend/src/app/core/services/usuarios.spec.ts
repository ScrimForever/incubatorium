import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Role } from '../models/auth';
import { NovoUsuario, UsuarioAdmin, UsuariosService, alteracaoDePapel, papelDe } from './usuarios';

const CONTA: UsuarioAdmin = {
  id: 'abc-123',
  email: 'ana@teccampos.com',
  is_active: true,
  is_superuser: false,
  is_verified: false,
  is_incubado: true,
  is_admin: false,
  is_consultor: false,
  is_colaborador: false,
};

/** `PATCH`/`GET`/`DELETE` são por e-mail, com o @ percent-encoded. */
const ROTA_CONTA = '/api/usuarios/ana%40teccampos.com';

describe('papelDe', () => {
  it('prefere o role que o mock da listagem guardou', () => {
    expect(papelDe({ ...CONTA, role: 'avaliador' })).toBe('avaliador');
  });

  it('conta real, sem role, lê as flags da API — como a sessão', () => {
    const sem = { ...CONTA, is_incubado: false };
    expect(papelDe({ ...sem, is_consultor: true })).toBe('avaliador');
    expect(papelDe({ ...sem, is_colaborador: true })).toBe('colaborador');
    expect(papelDe({ ...sem, is_admin: true })).toBe('admin');
    expect(papelDe({ ...sem, is_superuser: true })).toBe('admin');
  });

  it('só com is_incubado, é incubado', () => {
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

    const req = backend.expectOne('/api/usuarios/todos');
    expect(req.request.method).toBe('GET');
    req.flush([CONTA]);

    expect(recebidas?.length).toBe(1);
  });

  it('busca uma conta pelo e-mail, com o @ escapado', () => {
    service.buscar(CONTA.email).subscribe();
    expect(backend.expectOne(ROTA_CONTA).request.method).toBe('GET');
  });

  it('altera só os campos informados', () => {
    service.alterar(CONTA.email, { is_active: false }).subscribe();

    const req = backend.expectOne(ROTA_CONTA);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ is_active: false });
    req.flush({ ...CONTA, is_active: false });
  });

  it('troca o papel mandando role e is_superuser juntos', () => {
    service.alterar(CONTA.email, alteracaoDePapel('avaliador')).subscribe();

    const req = backend.expectOne(ROTA_CONTA);
    expect(req.request.body).toEqual({ role: 'avaliador', is_superuser: false });
    req.flush({ ...CONTA, role: 'avaliador' });
  });

  it('exclui a conta', () => {
    service.excluir(CONTA.email).subscribe();

    const req = backend.expectOne(ROTA_CONTA);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('cria uma conta via POST /usuarios', () => {
    const dados: NovoUsuario = {
      email: 'novo@teccampos.com',
      password: 'senha123',
      nome: 'Novo',
      sobrenome: 'Usuario',
      telefone: '(51) 99999-9999',
      is_admin: false,
      is_colaborador: false,
      is_consultor: false,
      is_incubado: true,
    };
    let criado: UsuarioAdmin | undefined;
    service.criar(dados).subscribe((c) => (criado = c));

    const req = backend.expectOne('/api/usuarios');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dados);
    req.flush(
      { ...CONTA, email: dados.email, nome: dados.nome },
      { status: 201, statusText: 'Created' },
    );

    expect(criado?.email).toBe('novo@teccampos.com');
  });
});
