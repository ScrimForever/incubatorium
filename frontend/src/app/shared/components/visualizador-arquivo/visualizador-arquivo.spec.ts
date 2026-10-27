import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Anexo } from '../../../core/models/questionario';
import { MAXIMO_LINHAS_CSV, VisualizadorArquivo } from './visualizador-arquivo';

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
   * deteccao de mudancas estoura.
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

  /** Espera o `Blob.text()` resolver e redesenha. */
  async function depoisDeLer(): Promise<void> {
    await new Promise((pronto) => setTimeout(pronto, 20));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('csv vira tabela, com a primeira linha de cabecalho', async () => {
    const csv = 'mes;receita\n1;8.000,50\n2;9.100,00\n';
    abrir(anexo('fluxo.csv', 'text/csv'), new Blob([csv], { type: 'text/csv' }));
    await depoisDeLer();

    const raiz: HTMLElement = fixture.nativeElement;
    const cabecalho = Array.from(raiz.querySelectorAll('.visu-tabela th')).map(
      (th) => th.textContent,
    );
    const linhas = Array.from(raiz.querySelectorAll('.visu-tabela tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => td.textContent),
    );
    expect(cabecalho).toEqual(['mes', 'receita']);
    expect(linhas).toEqual([
      ['1', '8.000,50'],
      ['2', '9.100,00'],
    ]);
    expect(texto(raiz.textContent ?? '')).toContain('Planilha CSV');
    expect(raiz.querySelector('.visu-texto')).toBeNull();
  });

  it('csv grande mostra so o comeco e avisa quantas linhas ficaram de fora', async () => {
    const linhas = Array.from({ length: MAXIMO_LINHAS_CSV + 5 }, (_, i) => `${i},x`).join('\n');
    abrir(anexo('grande.csv', ''), new Blob([`n,v\n${linhas}`]));
    await depoisDeLer();

    const raiz: HTMLElement = fixture.nativeElement;
    expect(raiz.querySelectorAll('.visu-tabela tbody tr').length).toBe(MAXIMO_LINHAS_CSV);
    expect(texto(raiz.textContent ?? '')).toContain('Mais 5 linhas no arquivo');
  });

  it('tipo que o navegador nao desenha fica so com o recado e o botao', () => {
    abrir(anexo('custos.xlsx', 'application/vnd.ms-excel'), new Blob(['x']));

    expect(texto(fixture.nativeElement.textContent)).toContain(
      'nao abre no navegador'.replace('nao', 'não'),
    );
    expect(fixture.nativeElement.querySelector('.visu-baixar')).toBeTruthy();
  });

  it('enquanto baixa, mostra o estado e nenhuma previa', () => {
    fixture.componentRef.setInput('carregando', true);
    abrir(anexo('mercado.png', 'image/png'), null);

    expect(fixture.nativeElement.querySelector('.visu-estado')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.visu-imagem-real')).toBeNull();
  });
});
