const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

/**
 * Converte texto puro (com `\n`) em parágrafos HTML: sem isso o Quill junta
 * todas as linhas num parágrafo só. Valor que já começa com tag passa intacto.
 */
export function textoParaHtml(valor: string): string {
  if (!valor.trim() || valor.trimStart().startsWith('<')) {
    return valor;
  }
  return valor
    .split(/\r?\n/)
    .map((linha) => `<p>${linha.replace(/[&<>"]/g, (c) => ESCAPES[c]) || '<br>'}</p>`)
    .join('');
}
