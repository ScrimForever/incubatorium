import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

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

  it('filtra a lista por status quando pedido', () => {
    service.listar('aguardando_aprovacao').subscribe();
    http.expectOne('/api/questionarios?status=aguardando_aprovacao').flush([]);
  });

  it('sem status, pede a lista inteira', () => {
    service.listar().subscribe();
    http.expectOne('/api/questionarios').flush([]);
  });

  it('escapa o e-mail na URL do plano', () => {
    service.plano('ana+teste@teccampos.com').subscribe();
    const pedido = http.expectOne((req) => req.url.startsWith('/api/questionario/'));
    expect(pedido.request.url).toBe('/api/questionario/ana%2Bteste%40teccampos.com');
    pedido.flush({ status_questionario: 'aguardando_aprovacao', json_questionario: {} });
  });

  it('normaliza o documento vindo do servidor, como no plano proprio', () => {
    let json: unknown;
    service.plano('ana@teccampos.com').subscribe((plano) => (json = plano.json_questionario));

    http.expectOne('/api/questionario/ana%40teccampos.com').flush({
      status_questionario: 'aguardando_aprovacao',
      json_questionario: { '2': { business_canvas: 'texto' } },
    });

    // As nove abas chegam completas e com `notas`, mesmo faltando no JSONB.
    expect((json as Record<string, { notas: unknown[] }>)['9'].notas).toEqual([]);
  });

  it('avaliar manda so aba, valor, texto e especialidade — nunca status', () => {
    service
      .avaliar('ana@teccampos.com', { aba: 6, valor: 4, texto: 'ok', especialidade: 'Mercado' })
      .subscribe();

    const pedido = http.expectOne('/api/questionario/ana%40teccampos.com/nota');
    expect(pedido.request.method).toBe('PATCH');
    expect(pedido.request.body).toEqual({
      aba: 6,
      valor: 4,
      texto: 'ok',
      especialidade: 'Mercado',
    });
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
