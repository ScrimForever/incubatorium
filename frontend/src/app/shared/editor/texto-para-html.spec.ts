import { textoParaHtml } from './texto-para-html';

describe('textoParaHtml', () => {
  it('põe cada linha do texto antigo num parágrafo', () => {
    expect(textoParaHtml('Primeira\nSegunda')).toBe('<p>Primeira</p><p>Segunda</p>');
  });

  it('mantém a linha em branco como parágrafo vazio', () => {
    expect(textoParaHtml('Um\r\n\r\nDois')).toBe('<p>Um</p><p><br></p><p>Dois</p>');
  });

  it('escapa o que pareceria tag', () => {
    expect(textoParaHtml('Custo < 5 & "margem" > 2')).toBe(
      '<p>Custo &lt; 5 &amp; &quot;margem&quot; &gt; 2</p>',
    );
  });

  it('não mexe no que já veio do editor', () => {
    const html = '<p><strong>Negrito</strong></p>';
    expect(textoParaHtml(html)).toBe(html);
  });

  it('devolve vazio como vazio, para o obrigatório continuar valendo', () => {
    expect(textoParaHtml('')).toBe('');
  });
});
