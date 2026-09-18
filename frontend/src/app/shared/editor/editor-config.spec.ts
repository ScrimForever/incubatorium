import Quill from 'quill';

import {
  EDITOR_CONFIG,
  acessibilizarEditor,
  deslocamentoParaCaber,
  manterMenusNaTela,
  valorDoEditor,
} from './editor-config';

/** O MutationObserver avisa depois do ciclo de eventos atual. */
const esperarObservador = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

describe('editor-config', () => {
  let area: HTMLElement;
  let editor: Quill;

  beforeEach(() => {
    area = document.createElement('div');
    const alvo = document.createElement('div');
    area.appendChild(alvo);
    document.body.appendChild(area);
    editor = new Quill(alvo, {
      theme: 'snow',
      modules: EDITOR_CONFIG.modules,
      formats: EDITOR_CONFIG.formats,
    });
  });

  afterEach(() => area.remove());

  it('traduz botões e seletores da barra', () => {
    acessibilizarEditor(editor, 'campo-rotulo');

    const rotulo = (seletor: string) => area.querySelector(seletor)?.getAttribute('aria-label');
    expect(rotulo('button.ql-bold')).toBe('Negrito');
    expect(rotulo('button.ql-list[value="ordered"]')).toBe('Lista numerada');
    expect(rotulo('button.ql-indent[value="+1"]')).toBe('Aumentar recuo');
    expect(rotulo('.ql-header .ql-picker-label')).toBe('Estilo do parágrafo');
    expect(area.querySelector('.ql-toolbar')?.getAttribute('role')).toBe('toolbar');
  });

  it('liga a área de texto ao rótulo do campo', () => {
    acessibilizarEditor(editor, 'campo-rotulo');

    expect(editor.root.getAttribute('aria-labelledby')).toBe('campo-rotulo');
    expect(editor.root.getAttribute('aria-multiline')).toBe('true');
  });

  it('não oferece imagem nem vídeo', () => {
    expect(area.querySelector('.ql-image, .ql-video')).toBeNull();
  });

  it('grava espaço comum, não &nbsp;, e preserva espaços seguidos', () => {
    editor.setText('Custo  total da obra');

    expect(valorDoEditor(editor)).toBe('<p>Custo&nbsp; total da obra</p>');
  });

  it('devolve vazio quando não há texto', () => {
    editor.setText('   ');

    expect(valorDoEditor(editor)).toBe('');
  });

  it('traz para dentro da tela o menu que passa da borda', () => {
    // Paleta de 152px aberta em x=177 numa tela de 320: sobra 9px, mais a folga.
    expect(deslocamentoParaCaber(177, 329, 320)).toBe(-17);
    expect(deslocamentoParaCaber(2, 154, 320)).toBe(6);
    expect(deslocamentoParaCaber(40, 192, 320)).toBe(0);
  });

  it('encosta na folga da esquerda o menu mais largo que a tela', () => {
    expect(deslocamentoParaCaber(100, 500, 320)).toBe(-92);
  });

  it('desloca o menu aberto e devolve ao lugar quando fecha', async () => {
    manterMenusNaTela(editor);
    const seletor = area.querySelector<HTMLElement>('.ql-color.ql-picker')!;
    const menu = seletor.querySelector<HTMLElement>('.ql-picker-options')!;
    // Seletor a 20px da borda direita, com a paleta da largura que o tema dá.
    seletor.style.cssText = `position: fixed; top: 0; left: ${document.documentElement.clientWidth - 20}px`;
    menu.style.cssText = 'display: block; position: absolute; width: 152px';

    seletor.classList.add('ql-expanded');
    await esperarObservador();
    expect(menu.style.transform).toMatch(/^translateX\(-\d+px\)$/);

    seletor.classList.remove('ql-expanded');
    await esperarObservador();
    expect(menu.style.transform).toBe('');
  });

  it('deixa o Tab sair do editor, inclusive dentro de lista', () => {
    editor.setContents([{ insert: 'item' }, { insert: '\n', attributes: { list: 'bullet' } }]);
    editor.setSelection(2, 0);

    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    editor.root.dispatchEvent(tab);

    expect(tab.defaultPrevented).toBeFalse();
    expect(editor.getText()).toBe('item\n');
  });
});
