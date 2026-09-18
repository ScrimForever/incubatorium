import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ArquivosService } from './arquivos';

const arquivo = (nome: string): File => new File(['conteudo'], nome, { type: 'application/pdf' });

describe('ArquivosService', () => {
  let service: ArquivosService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ArquivosService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('envia para a aba pedida, em multipart, no campo arquivos', () => {
    service.enviar(6, [arquivo('mercado.pdf'), arquivo('anexo.pdf')]).subscribe();

    const pedido = http.expectOne('/api/arquivos/questionario/6');
    expect(pedido.request.method).toBe('POST');

    const corpo = pedido.request.body as FormData;
    expect(corpo instanceof FormData).toBeTrue();
    const enviados = corpo.getAll('arquivos') as File[];
    expect(enviados.map((item) => item.name)).toEqual(['mercado.pdf', 'anexo.pdf']);

    pedido.flush({ arquivos_recebidos: [] });
  });

  it('nao declara Content-Type — quem escreve o boundary e o navegador', () => {
    service.enviar(9, [arquivo('planilha.xlsx')]).subscribe();

    const pedido = http.expectOne('/api/arquivos/questionario/9');
    expect(pedido.request.headers.has('Content-Type')).toBeFalse();

    pedido.flush({ arquivos_recebidos: [] });
  });

  it('traduz a resposta da API na ficha que o documento guarda', () => {
    let anexos: unknown;
    service.enviar(6, [arquivo('mercado.pdf')]).subscribe((resultado) => (anexos = resultado));

    http.expectOne('/api/arquivos/questionario/6').flush({
      arquivos_recebidos: [{ nome: 'mercado.pdf', content_type: 'application/pdf', tamanho: 2048 }],
    });

    expect(anexos).toEqual([{ nome: 'mercado.pdf', tipo: 'application/pdf', tamanho: 2048 }]);
  });

  it('propaga a falha do envio, para a tela nao gravar ficha sem arquivo', () => {
    let erro: unknown;
    service.enviar(6, [arquivo('mercado.pdf')]).subscribe({ error: (e) => (erro = e) });

    http
      .expectOne('/api/arquivos/questionario/6')
      .flush({ detail: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    expect(erro).toBeTruthy();
  });
});
