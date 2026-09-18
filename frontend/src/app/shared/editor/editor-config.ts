import type { QuillConfig } from 'ngx-quill/config';
import type Quill from 'quill';

/**
 * Formatos que o editor aceita. A lista vale também para o que se cola de
 * fora (Word, Google Docs): o que não está aqui é descartado. Imagem e vídeo
 * ficam de fora porque o Quill os grava dentro do HTML — em base64, no caso da
 * imagem — e o `PUT` do questionário reenvia o documento inteiro.
 */
const FORMATOS = [
  'header',
  'size',
  'bold',
  'italic',
  'underline',
  'strike',
  'color',
  'background',
  'script',
  'list',
  'indent',
  'align',
  'blockquote',
  'code-block',
  'link',
];

const BARRA = [
  [{ header: [2, 3, 4, false] }, { size: ['small', false, 'large', 'huge'] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ color: [] }, { background: [] }],
  [{ script: 'sub' }, { script: 'super' }],
  [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
  [{ indent: '-1' }, { indent: '+1' }, { align: [] }],
  ['blockquote', 'code-block', 'link'],
  ['clean'],
];

/** Deixa o Tab seguir para o próximo campo em vez de virar recuo. */
const tabLivre = { key: 'Tab', handler: () => true };
const shiftTabLivre = { key: 'Tab', shiftKey: true, handler: () => true };

export const EDITOR_CONFIG: QuillConfig = {
  theme: 'snow',
  format: 'html',
  formats: FORMATOS,
  placeholder: 'Escreva aqui',
  modules: {
    toolbar: BARRA,
    // Sem isso o Quill prende o Tab dentro do editor e quem navega pelo
    // teclado não sai mais do campo. O recuo continua pelos botões.
    keyboard: {
      bindings: {
        tab: tabLivre,
        indent: tabLivre,
        outdent: shiftTabLivre,
        'indent code-block': tabLivre,
        'outdent code-block': shiftTabLivre,
      },
    },
  },
};

/**
 * Rótulos da barra, pela classe do controle (`ql-bold`) e, quando o mesmo
 * formato tem mais de um botão, pelo valor (`ql-list` + `ordered`).
 */
export const ROTULOS_BARRA: Readonly<Record<string, string>> = {
  header: 'Estilo do parágrafo',
  size: 'Tamanho do texto',
  bold: 'Negrito',
  italic: 'Itálico',
  underline: 'Sublinhado',
  strike: 'Tachado',
  color: 'Cor do texto',
  background: 'Cor de destaque',
  'script:sub': 'Subscrito',
  'script:super': 'Sobrescrito',
  'list:ordered': 'Lista numerada',
  'list:bullet': 'Lista com marcadores',
  'list:check': 'Lista de tarefas',
  'indent:-1': 'Diminuir recuo',
  'indent:+1': 'Aumentar recuo',
  align: 'Alinhamento',
  blockquote: 'Citação',
  'code-block': 'Bloco de código',
  link: 'Link',
  clean: 'Limpar formatação',
};

/**
 * O valor que vai para o formulário. Substitui o `getSemanticHTML()` puro, que
 * no Quill 2.0.3 troca todo espaço por `&nbsp;` — o texto ficaria sem quebra
 * de linha fora do editor (PDF, relatório) e bem maior no JSON. Numa sequência
 * de espaços só o último volta a ser espaço comum, para os demais não sumirem.
 */
export function valorDoEditor(editor: Quill): string {
  if (!editor.getText().trim()) {
    return '';
  }
  return editor.getSemanticHTML().replace(/((?:&nbsp;)*)&nbsp;/g, '$1 ');
}

/**
 * Quantos pixels mover um menu na horizontal para ele caber na tela, com
 * `folga` nas bordas. Mais largo que a tela, ele encosta na folga da esquerda.
 */
export function deslocamentoParaCaber(
  esquerda: number,
  direita: number,
  larguraTela: number,
  folga = 8,
): number {
  if (direita > larguraTela - folga) {
    return Math.max(folga - esquerda, larguraTela - folga - direita);
  }
  return esquerda < folga ? folga - esquerda : 0;
}

/**
 * Mantém os menus da barra (cor, destaque, estilo) dentro da tela. O tema abre
 * cada menu alinhado à esquerda do botão, com largura fixa: num celular a
 * paleta de 152px de um botão perto da borda saía pela lateral, cortada.
 */
export function manterMenusNaTela(editor: Quill): void {
  const toolbar = editor.getModule('toolbar') as { container?: HTMLElement } | undefined;
  const barra = toolbar?.container;
  if (!barra) {
    return;
  }
  new MutationObserver((mudancas) => {
    for (const { target } of mudancas) {
      const menu = (target as Element).querySelector<HTMLElement>(':scope > .ql-picker-options');
      if (!menu) {
        continue;
      }
      menu.style.transform = '';
      if ((target as Element).classList.contains('ql-expanded')) {
        const caixa = menu.getBoundingClientRect();
        const dx = deslocamentoParaCaber(
          caixa.left,
          caixa.right,
          document.documentElement.clientWidth,
        );
        menu.style.transform = dx ? `translateX(${dx}px)` : '';
      }
    }
  }).observe(barra, { attributes: true, attributeFilter: ['class'], subtree: true });
}

/** O formato de um controle da barra, a partir das classes `ql-*` dele. */
function formatoDe(elemento: Element): string | null {
  const classe = Array.from(elemento.classList).find(
    (nome) => nome.startsWith('ql-') && nome !== 'ql-picker' && nome !== 'ql-active',
  );
  return classe ? classe.slice(3) : null;
}

/**
 * Traduz a barra e liga o editor ao rótulo do campo. O Quill cria a barra em
 * inglês e com `<span>` nos seletores; o `label for` não alcança um
 * `contenteditable`, daí o `aria-labelledby`.
 */
export function acessibilizarEditor(editor: Quill, rotuloId: string): void {
  const toolbar = editor.getModule('toolbar') as { container?: HTMLElement } | undefined;
  const barra = toolbar?.container;
  if (barra) {
    barra.setAttribute('role', 'toolbar');
    barra.setAttribute('aria-label', 'Formatação do texto');
    barra.querySelectorAll('button, .ql-picker').forEach((controle) => {
      const formato = formatoDe(controle);
      if (!formato) {
        return;
      }
      const valor = controle.getAttribute('value');
      const rotulo = ROTULOS_BARRA[`${formato}:${valor}`] ?? ROTULOS_BARRA[formato];
      if (!rotulo) {
        return;
      }
      // No seletor, quem recebe foco é o rótulo interno, não o `<span>` de fora.
      const alvo = controle.querySelector('.ql-picker-label') ?? controle;
      alvo.setAttribute('aria-label', rotulo);
      alvo.setAttribute('title', rotulo);
    });
  }
  editor.root.setAttribute('aria-labelledby', rotuloId);
  editor.root.setAttribute('aria-multiline', 'true');
}
