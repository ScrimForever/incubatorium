import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Anexo } from '../../../core/models/questionario';
import { VisualizadorArquivo } from './visualizador-arquivo';

const anexo = (nome: string, tipo: string): Anexo => ({ nome, tipo, tamanho: 2048 });

describe('VisualizadorArquivo', () => {
  let fixture: ComponentFixture<VisualizadorArquivo>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [VisualizadorArquivo] }).compileComponents();
    fixture = TestBed.createComponent(VisualizadorArquivo);
  });

  function abrir(arquivo: Anexo, conteudo: Blob | null): void {
    fixture.componentRef.setInput('arquivo', arquivo);
    fixture.componentRef.setInput('conteudo', conteudo);
    fixture.detectChanges();
  }

  const texto = (html: string): string => html.replace(/\s+/g, ' ').trim();

  /**
   * O efeito que monta a previa le e escreve o mesmo sinal `url`. Sem
   * `untracked` ele se reagenda para sempre: em producao a aba congela e aqui a
   * deteccao de mudancas estoura. Este spec existe por causa desse bug.
   */
  it('monta a previa de imagem sem entrar em laco de efeito', () => {
    expect(() =>
      abrir(anexo('mercado.png', 'image/png'), new Blob(['x'], { type: 'image/png' })),
    ).not.toThrow();

    const img: HTMLImageElement | null = fixture.nativeElement.querySelector('.visu-imagem-real');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')?.startsWith('blob:')).toBeTrue();
  });

  it('pdf vai para o quadro do navegador, nao para o <pre>', () => {
    abrir(anexo('plano.pdf', 'application/pdf'), new Blob(['%PDF-'], { type: 'application/pdf' }));

    expect(fixture.nativeElement.querySelector('.visu-quadro')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.visu-texto')).toBeNull();
  });

  it('texto e lido e desenhado como texto', async () => {
    abrir(anexo('notas.txt', 'text/plain'), new Blob(['linha um'], { type: 'text/plain' }));
    // `Blob.text()` resolve num microtask proprio; um macrotask garante que ele
    // ja passou antes da leitura.
    await new Promise((pronto) => setTimeout(pronto, 20));
    await fixture.whenStable();
    fixture.detectChanges();

    const pre: HTMLElement | null = fixture.nativeElement.querySelector('.visu-texto');
    expect(pre?.textContent).toBe('linha um');
    expect(fixture.nativeElement.querySelector('.visu-quadro')).toBeNull();
  });

  it('tipo que o navegador nao desenha fica so com o recado e o botao', () => {
    abrir(anexo('custos.xlsx', 'application/vnd.ms-excel'), new Blob(['x']));

    expect(texto(fixture.nativeElement.textContent)).toContain(
      'nao abre no navegador'.replace('nao', 'não'),
    );
    expect(fixture.nativeElement.querySelector('.visu-baixar')).toBeTruthy();
  });

  it('sem permissao de baixar, some o botao e o recado explica o porque', () => {
    fixture.componentRef.setInput('podeBaixar', false);
    abrir(anexo('plano.pdf', 'application/pdf'), null);

    expect(fixture.nativeElement.querySelector('.visu-baixar')).toBeNull();
    expect(texto(fixture.nativeElement.textContent)).toContain(
      'falta no backend a rota que dá acesso ao arquivo de outra pessoa',
    );
  });

  it('enquanto baixa, mostra o estado e nenhuma previa', () => {
    fixture.componentRef.setInput('carregando', true);
    abrir(anexo('mercado.png', 'image/png'), null);

    expect(fixture.nativeElement.querySelector('.visu-estado')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.visu-imagem-real')).toBeNull();
  });
});
