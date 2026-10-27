/**
 * Lê um CSV em linhas de células, para a pré-visualização em tabela. O
 * separador é adivinhado na primeira linha: o Excel em PT-BR exporta com `;`
 * (a vírgula é o decimal), o resto do mundo com `,`. Campo entre aspas pode
 * ter separador e quebra de linha dentro, e `""` é uma aspa literal.
 */
export function lerCsv(texto: string): string[][] {
  const limpo = texto.replace(/^\uFEFF/, '');
  const separador = separadorDe(limpo);
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = '';
  let entreAspas = false;

  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (entreAspas) {
      if (c === '"' && limpo[i + 1] === '"') {
        celula += '"';
        i++;
      } else if (c === '"') {
        entreAspas = false;
      } else {
        celula += c;
      }
    } else if (c === '"') {
      entreAspas = true;
    } else if (c === separador) {
      linha.push(celula);
      celula = '';
    } else if (c === '\n' || c === '\r') {
      // `\r\n` do Windows é uma quebra só.
      if (c === '\r' && limpo[i + 1] === '\n') {
        i++;
      }
      linha.push(celula);
      linhas.push(linha);
      linha = [];
      celula = '';
    } else {
      celula += c;
    }
  }
  if (celula || linha.length) {
    linha.push(celula);
    linhas.push(linha);
  }
  // Linha em branco no meio ou no fim do arquivo não é registro.
  return linhas.filter((cells) => cells.some((cel) => cel.trim() !== ''));
}

/** `;` quando a primeira linha tem mais deles que vírgulas, fora de aspas. */
function separadorDe(texto: string): ',' | ';' {
  let virgulas = 0;
  let pontoEVirgulas = 0;
  let entreAspas = false;
  for (const c of texto) {
    if (c === '"') {
      entreAspas = !entreAspas;
    } else if (!entreAspas && (c === '\n' || c === '\r')) {
      break;
    } else if (!entreAspas && c === ',') {
      virgulas++;
    } else if (!entreAspas && c === ';') {
      pontoEVirgulas++;
    }
  }
  return pontoEVirgulas > virgulas ? ';' : ',';
}
