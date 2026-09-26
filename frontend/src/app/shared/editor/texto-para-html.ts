const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

/**
 * Converte uma resposta gravada antes do editor (texto puro, com `\n`) em HTML.
 *
 * Sem isso o Quill lê o texto como HTML e junta todas as linhas num parágrafo
 * só. Valor que já começa com tag passa intacto.
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
