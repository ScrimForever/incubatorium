import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { errorInterceptor } from '../interceptors/error-interceptor';
import { ApiError } from '../models/auth';
import { ArquivosService } from './arquivos';

const arquivo = (nome: string): File => new File(['conteudo'], nome, { type: 'application/pdf' });

describe('ArquivosService', () => {
  let service: ArquivosService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      // Com o error-interceptor no lugar: é ele que transforma a falha em
      // ApiError, e o que a tela recebe depende dessa dupla.
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
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
  it('lista os nomes que existem no disco da aba', () => {
    let nomes: unknown;
    service.listar(6).subscribe((r) => (nomes = r));

    const pedido = http.expectOne('/api/arquivos/questionario/nome-arquivo/6');
    expect(pedido.request.method).toBe('GET');
    pedido.flush(['mercado.pdf', 'concorrentes.pdf']);

    expect(nomes).toEqual(['mercado.pdf', 'concorrentes.pdf']);
  });

  it('aba sem pasta responde 500 e para a tela isso e lista vazia', () => {
    let nomes: unknown;
    let erro: unknown;
    service.listar(9).subscribe({ next: (r) => (nomes = r), error: (e) => (erro = e) });

    http
      .expectOne('/api/arquivos/questionario/nome-arquivo/9')
      .flush('Internal Server Error', { status: 500, statusText: 'Internal Server Error' });

    expect(nomes).toEqual([]);
    expect(erro).toBeUndefined();
  });

  it('falha de sessao na listagem nao chega na tela: derrubar sessao e do interceptor', () => {
    let nomes: unknown;
    let erro: unknown;
    service.listar(6).subscribe({ next: (r) => (nomes = r), error: (e) => (erro = e) });

    http
      .expectOne('/api/arquivos/questionario/nome-arquivo/6')
      .flush({ detail: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    expect(nomes).toEqual([]);
    expect(erro).toBeUndefined();
  });

  it('baixa por POST, com o nome no corpo e o path param todos em 0', () => {
    let conteudo: unknown;
    service.baixar(6, 'mercado.pdf').subscribe((r) => (conteudo = r));

    const pedido = http.expectOne('/api/arquivos/questionario/download/6/0');
    expect(pedido.request.method).toBe('POST');
    expect(pedido.request.body).toEqual({ nome_arquivo: 'mercado.pdf' });
    expect(pedido.request.responseType).toBe('blob');

    const blob = new Blob(['conteudo'], { type: 'application/pdf' });
    pedido.flush(blob);

    expect(conteudo).toBe(blob);
  });

  it('arquivo fora do disco vem 404 e vira recado de arquivo, nao de rota', () => {
    let erro: ApiError | undefined;
    service.baixar(9, 'sumiu.pdf').subscribe({ error: (e: ApiError) => (erro = e) });

    http
      .expectOne('/api/arquivos/questionario/download/9/0')
      .flush(null, { status: 404, statusText: 'Not Found' });

    expect(erro?.code).toBe('NOT_FOUND');
    expect(erro?.message).toBe('Este arquivo não está mais no servidor.');
  });

  it('apaga mandando a lista crua de nomes no corpo do DELETE', () => {
    let resposta: unknown;
    service.apagar(6, ['mercado.pdf']).subscribe((r) => (resposta = r));

    const pedido = http.expectOne('/api/arquivos/questionario/6');
    expect(pedido.request.method).toBe('DELETE');
    expect(pedido.request.body).toEqual(['mercado.pdf']);

    pedido.flush({ arquivos_deletados: ['mercado.pdf'], erros: null });

    expect(resposta).toEqual({ arquivos_deletados: ['mercado.pdf'], erros: null });
  });

  it('nome que ja nao existe volta em erros, com 200 - para a tela e o mesmo que apagado', () => {
    let resposta: { erros: unknown } | undefined;
    let erro: unknown;
    service
      .apagar(9, ['fantasma.txt'])
      .subscribe({ next: (r) => (resposta = r), error: (e) => (erro = e) });

    http.expectOne('/api/arquivos/questionario/9').flush({
      arquivos_deletados: [],
      erros: [{ arquivo: 'fantasma.txt', erro: 'Arquivo nao encontrado' }],
    });

    expect(erro).toBeUndefined();
    expect(resposta?.erros).toEqual([{ arquivo: 'fantasma.txt', erro: 'Arquivo nao encontrado' }]);
  });
});
