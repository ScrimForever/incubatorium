import { fakeAsync, tick } from '@angular/core/testing';

import { salvarComo } from './salvar-como';

describe('salvarComo', () => {
  let criado: HTMLAnchorElement | undefined;
  let noDocumentoNoClique: boolean | undefined;
  let revogadas: string[];

  beforeEach(() => {
    criado = undefined;
    noDocumentoNoClique = undefined;
    revogadas = [];

    const original = document.createElement.bind(document);
    spyOn(document, 'createElement').and.callFake((tag: string) => {
      const el = original(tag);
      if (tag === 'a') {
        criado = el as HTMLAnchorElement;
        spyOn(el, 'click').and.callFake(() => {
          noDocumentoNoClique = el.isConnected;
        });
      }
      return el;
    });

    spyOn(URL, 'createObjectURL').and.returnValue('blob:teste');
    spyOn(URL, 'revokeObjectURL').and.callFake((u: string) => void revogadas.push(u));
  });

  /**
   * Link fora do documento no clique ou URL revogada na mesma volta: nos dois
   * casos o Chrome nao baixa nada, em silencio.
   */
  it('poe o link no documento antes de clicar, e o tira depois', fakeAsync(() => {
    salvarComo(new Blob(['x']), 'mercado.pdf');

    expect(noDocumentoNoClique).withContext('link tem de estar no documento').toBeTrue();
    expect(criado?.isConnected).withContext('e sair de la depois').toBeFalse();
    tick(10_000);
  }));

  it('nao esconde o link: com display none o Chrome ignora o clique', fakeAsync(() => {
    salvarComo(new Blob(['x']), 'mercado.pdf');

    expect(criado?.hidden).toBeFalse();
    expect(criado?.style.display).not.toBe('none');
    tick(10_000);
  }));

  it('nomeia o arquivo salvo', fakeAsync(() => {
    salvarComo(new Blob(['x']), 'planilha 2026.xlsx');

    expect(criado?.download).toBe('planilha 2026.xlsx');
    expect(criado?.getAttribute('href')).toBe('blob:teste');
    tick(10_000);
  }));

  it('so devolve o blob depois, senao o download e cancelado', fakeAsync(() => {
    salvarComo(new Blob(['x']), 'mercado.pdf');

    expect(revogadas).withContext('nao pode revogar na mesma volta').toEqual([]);
    tick(10_000);
    expect(revogadas).toEqual(['blob:teste']);
  }));
});
