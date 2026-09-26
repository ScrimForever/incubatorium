/**
 * Quando uma coisa aconteceu, em PT-BR: dd/mm/aaaa hh:mm.
 *
 * Mora no `shared` porque duas telas assinam nota com isto — o card de
 * avaliação e a leitura do plano —, e componente compartilhado não pode
 * depender de página. Data quebrada vira string vazia, e não "Invalid Date".
 */
export function formatarQuando(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime())
    ? ''
    : new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(data);
}
