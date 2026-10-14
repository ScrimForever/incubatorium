import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { PlanoResumo } from '../models/plano';
import { PlanosService } from './planos';

describe('PlanosService', () => {
  let service: PlanosService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PlanosService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Dois planos como a API devolve: a linha inteira, documento junto. */
  const TODOS = [
    {
      id: 1,
      usuario_email: 'ana@teccampos.com',
      status_questionario: 'aguardando_aprovacao',
      criado_em: '2026-09-10T12:00:00Z',
      atualizado_em: null,
      json_questionario: { '1': { nome_proponente: 'Ana Souza', nome_negocio: 'NutriData' } },
    },
    {
      id: 2,
      usuario_email: 'bruno@teccampos.com',
      status_questionario: 'iniciado',
      criado_em: '2026-09-12T15:20:00Z',
      json_questionario: {},
    },
  ];

  it('filtra por status na tela, porque a rota devolve todos', () => {
    let lista: PlanoResumo[] = [];
    service.listar('aguardando_aprovacao').subscribe((planos) => (lista = planos));
    http.expectOne('/api/questionario/todos').flush(TODOS);

    expect(lista.map((plano) => plano.usuario_email)).toEqual(['ana@teccampos.com']);
  });

  it('resume cada plano com os nomes da etapa 1, vazios quando ela falta', () => {
    let lista: PlanoResumo[] = [];
    service.listar().subscribe((planos) => (lista = planos));
    http.expectOne('/api/questionario/todos').flush(TODOS);

    expect(lista).toEqual([
      {
        usuario_email: 'ana@teccampos.com',
        status_questionario: 'aguardando_aprovacao',
        criado_em: '2026-09-10T12:00:00Z',
        atualizado_em: null,
        nome_proponente: 'Ana Souza',
        nome_negocio: 'NutriData',
      },
      {
        usuario_email: 'bruno@teccampos.com',
        status_questionario: 'iniciado',
        criado_em: '2026-09-12T15:20:00Z',
        atualizado_em: null,
        nome_proponente: '',
        nome_negocio: '',
      },
    ]);
  });

  it('o false da rota (falha de banco) vira lista vazia', () => {
    let lista: PlanoResumo[] | undefined;
    service.listar().subscribe((planos) => (lista = planos));
    http.expectOne('/api/questionario/todos').flush(false);

    expect(lista).toEqual([]);
  });

  it('escapa o e-mail na URL do plano', () => {
    service.plano('ana+teste@teccampos.com').subscribe();
    const pedido = http.expectOne((req) => req.url.startsWith('/api/usuarios/'));
    expect(pedido.request.url).toBe('/api/usuarios/ana%2Bteste%40teccampos.com/plano');
    pedido.flush({ status_questionario: 'aguardando_aprovacao', json_questionario: {} });
  });

  it('normaliza o documento vindo do servidor, como no plano proprio', () => {
    let json: unknown;
    service.plano('ana@teccampos.com').subscribe((plano) => (json = plano.json_questionario));

    http.expectOne('/api/usuarios/ana%40teccampos.com/plano').flush({
      status_questionario: 'aguardando_aprovacao',
      json_questionario: { '2': { business_canvas: 'texto' } },
    });

    // As nove abas chegam completas e com `avaliacao`, mesmo faltando no JSONB.
    expect((json as Record<string, { avaliacao: unknown }>)['9'].avaliacao).toBeNull();
  });

  it('avaliar manda so aba, nota e comentario — nunca status nem avaliador', () => {
    service.avaliar('ana@teccampos.com', { aba: 6, nota: 4, comentario: 'ok' }).subscribe();

    const pedido = http.expectOne('/api/questionario/ana%40teccampos.com/nota');
    expect(pedido.request.method).toBe('PATCH');
    expect(pedido.request.body).toEqual({ aba: 6, nota: 4, comentario: 'ok' });
    // Quem assina a nota e o token: mandar o avaliador daqui deixaria qualquer
    // um assinar em nome de outro.
    expect(Object.keys(pedido.request.body as object)).not.toContain('avaliador');
    // A regra de produto no formato: avaliar não aprova.
    expect(Object.keys(pedido.request.body as object)).not.toContain('status_questionario');

    pedido.flush({ status_questionario: 'aguardando_aprovacao', json_questionario: {} });
  });

  it('decidir manda o status por uma rota separada da nota', () => {
    service
      .decidir('ana@teccampos.com', { status: 'rejeitado', justificativa: 'Faltou o financeiro.' })
      .subscribe();

    const pedido = http.expectOne('/api/questionario/ana%40teccampos.com/status');
    expect(pedido.request.method).toBe('PATCH');
    expect(pedido.request.body).toEqual({
      status: 'rejeitado',
      justificativa: 'Faltou o financeiro.',
    });
    // Quem decidiu e quando são do servidor: mandar daqui seria assinar por outro.
    expect(Object.keys(pedido.request.body as object)).not.toContain('por');
    expect(Object.keys(pedido.request.body as object)).not.toContain('em');

    pedido.flush({ status_questionario: 'rejeitado', json_questionario: {} });
  });

  it('avaliar e decidir sao as unicas escritas, e so decidir mexe no status', () => {
    const metodos = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
    expect(metodos).toEqual(['constructor', 'listar', 'plano', 'avaliar', 'decidir']);
  });
});
