import { lerCsv } from './csv';

describe('lerCsv', () => {
  it('separa por virgula e por linha', () => {
    expect(lerCsv('mes,receita\n1,8000\n2,9000\n')).toEqual([
      ['mes', 'receita'],
      ['1', '8000'],
      ['2', '9000'],
    ]);
  });

  it('usa ponto e virgula quando e o separador do arquivo (Excel em PT-BR)', () => {
    expect(lerCsv('mes;receita\r\n1;8.000,50\r\n')).toEqual([
      ['mes', 'receita'],
      ['1', '8.000,50'],
    ]);
  });

  it('respeita aspas: separador, quebra de linha e aspa escapada dentro do campo', () => {
    const csv = 'nome,obs\n"Silva, Ana","linha 1\nlinha 2"\n"Loja ""Boa""",x\n';
    expect(lerCsv(csv)).toEqual([
      ['nome', 'obs'],
      ['Silva, Ana', 'linha 1\nlinha 2'],
      ['Loja "Boa"', 'x'],
    ]);
  });

  it('ignora o BOM, linhas em branco e a falta de quebra no fim', () => {
    expect(lerCsv('\uFEFFa,b\n\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('celula vazia continua sendo celula', () => {
    expect(lerCsv('a,b,c\n1,,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });
});
