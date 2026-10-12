/** Tempo até devolver o `blob:`; o download já leu o que precisava muito antes. */
const ESPERA_ANTES_DE_REVOGAR = 10_000;

/**
 * Salva um blob com nome, via `<a download>` sintético. O link tem de estar no
 * documento e sem `display: none` na hora do clique (o Chrome ignora em
 * silêncio), e a URL só pode ser revogada depois: o download é assíncrono.
 */
export function salvarComo(conteudo: Blob, nome: string): void {
  const url = URL.createObjectURL(conteudo);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), ESPERA_ANTES_DE_REVOGAR);
}
