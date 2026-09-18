import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Anexo, JsonQuestionario, Questionario, documentoVazio } from '../models/questionario';
import {
  QuestionarioService,
  emPreenchimento,
  temConteudo,
  etapaAcessivel,
  etapaCompleta,
  etapaParaRetomar,
  etapasCompletas,
  normalizar,
  progresso,
} from './questionario';

const anexo = (nome: string): Anexo => ({
  nome,
  tipo: 'application/pdf',
  tamanho: 1024,
});

/** Uma resposta da API com o documento dado. */
const resposta = (json: JsonQuestionario): Questionario => ({
  status_questionario: 'pendente',
  json_questionario: json,
});

describe('etapaCompleta', () => {
  it('etapa 1 exige proponente, negócio e setor — mas não o CNPJ', () => {
    const json = documentoVazio();
    json['1'].nome_proponente = 'Maicon';
    json['1'].nome_negocio = 'TecCampos Labs';
    expect(etapaCompleta(json, 1)).toBeFalse();

    json['1'].setor_atuacao = 'Tecnologia da informação';
    expect(etapaCompleta(json, 1)).toBeTrue();
    expect(json['1'].cnpj).toBe('');
  });

  it('etapas de texto único bastam ter conteúdo', () => {
    const json = documentoVazio();
    expect(etapaCompleta(json, 2)).toBeFalse();
    json['2'].business_canvas = 'Segmento de clientes: ...';
    expect(etapaCompleta(json, 2)).toBeTrue();
  });

  it('não aceita texto só com espaços', () => {
    const json = documentoVazio();
    json['3'].sumario_executivo = '    ';
    expect(etapaCompleta(json, 3)).toBeFalse();
  });

  it('etapa 4 precisa de ao menos um membro', () => {
    const json = documentoVazio();
    expect(etapaCompleta(json, 4)).toBeFalse();

    json['4'].equipe = [
      {
        id: 'm1',
        nome: 'Maicon',
        formacao_academica: 'Computação',
        experiencia: '',
        email: 'maicon@teccampos.com',
        telefone: '',
      },
    ];
    expect(etapaCompleta(json, 4)).toBeTrue();
  });

  it('etapa 6 exige os três textos e o anexo', () => {
    const json = documentoVazio();
    json['6'].fornecedores = 'a';
    json['6'].concorrentes = 'b';
    json['6'].analise_acao = 'c';
    expect(etapaCompleta(json, 6)).toBeFalse();

    json['6'].arquivos = [anexo('mercado.pdf')];
    expect(etapaCompleta(json, 6)).toBeTrue();
  });

  it('etapa 9 depende só das planilhas', () => {
    const json = documentoVazio();
    json['9'].observacoes = 'texto qualquer';
    expect(etapaCompleta(json, 9)).toBeFalse();

    json['9'].arquivos = [anexo('financeiro.xlsx')];
    expect(etapaCompleta(json, 9)).toBeTrue();
  });
});

describe('etapaAcessivel', () => {
  it('a primeira sempre abre', () => {
    expect(etapaAcessivel(documentoVazio(), 1)).toBeTrue();
  });

  it('esvaziar uma etapa fecha todas as seguintes, mesmo preenchidas', () => {
    const json = documentoVazio();
    json['1'].nome_proponente = 'Maicon';
    json['1'].nome_negocio = 'TecCampos';
    json['1'].setor_atuacao = 'TI';
    json['2'].business_canvas = 'canvas';
    json['3'].sumario_executivo = 'sumario';
    json['4'].equipe = [
      {
        id: 'm1',
        nome: 'Ana',
        formacao_academica: 'Adm',
        experiencia: '',
        email: 'ana@teccampos.com',
        telefone: '',
      },
    ];
    json['5'].planejamento_produto = 'produto';
    expect(etapaAcessivel(json, 6)).toBeTrue();

    // A equipe some, mas o texto da etapa 5 continua lá.
    json['4'].equipe = [];
    expect(etapaAcessivel(json, 5)).toBeFalse();
    expect(etapaAcessivel(json, 6)).toBeFalse();
    expect(etapaAcessivel(json, 9)).toBeFalse();
    expect(json['5'].planejamento_produto).toBe('produto');

    // Voltar a preencher a etapa 4 devolve o caminho inteiro.
    json['4'].equipe = [
      {
        id: 'm1',
        nome: 'Ana',
        formacao_academica: 'Adm',
        experiencia: '',
        email: 'ana@teccampos.com',
        telefone: '',
      },
    ];
    expect(etapaAcessivel(json, 6)).toBeTrue();
  });

  it('a seguinte só abre quando a anterior está completa', () => {
    const json = documentoVazio();
    expect(etapaAcessivel(json, 2)).toBeFalse();

    json['1'].nome_proponente = 'Maicon';
    json['1'].nome_negocio = 'TecCampos Labs';
    json['1'].setor_atuacao = 'TI';
    expect(etapaAcessivel(json, 2)).toBeTrue();
    expect(etapaAcessivel(json, 3)).toBeFalse();
  });
});

describe('progresso', () => {
  it('plano em branco é 0%', () => {
    expect(progresso(documentoVazio())).toBe(0);
    expect(etapasCompletas(documentoVazio())).toBe(0);
  });

  it('uma de nove dá 11%', () => {
    const json = documentoVazio();
    json['1'].nome_proponente = 'a';
    json['1'].nome_negocio = 'b';
    json['1'].setor_atuacao = 'c';
    expect(progresso(json)).toBe(11);
  });
});

describe('etapaParaRetomar', () => {
  const completarAte = (json: ReturnType<typeof documentoVazio>, ate: number): void => {
    const textos: Record<number, () => void> = {
      1: () => {
        json['1'].nome_proponente = 'Maicon';
        json['1'].nome_negocio = 'TecCampos';
        json['1'].setor_atuacao = 'TI';
      },
      2: () => (json['2'].business_canvas = 'canvas'),
      3: () => (json['3'].sumario_executivo = 'sumario'),
      4: () =>
        (json['4'].equipe = [
          {
            id: 'm1',
            nome: 'Ana',
            formacao_academica: 'Adm',
            experiencia: '',
            email: 'ana@teccampos.com',
            telefone: '',
          },
        ]),
      5: () => (json['5'].planejamento_produto = 'produto'),
      6: () => {
        json['6'].fornecedores = 'f';
        json['6'].concorrentes = 'c';
        json['6'].analise_acao = 'a';
        json['6'].arquivos = [anexo('mercado.pdf')];
      },
      7: () => (json['7'].planejamento_marketing = 'mkt'),
      8: () => (json['8'].planejamento_estrutura = 'estrutura'),
      9: () => (json['9'].arquivos = [anexo('financeiro.xlsx')]),
    };
    for (let numero = 1; numero <= ate; numero++) {
      textos[numero]();
    }
  };

  it('documento em branco abre na primeira', () => {
    expect(etapaParaRetomar(documentoVazio())).toBe(1);
  });

  it('abre na primeira etapa que falta, nao na inicial', () => {
    const json = documentoVazio();
    completarAte(json, 3);
    expect(etapaParaRetomar(json)).toBe(4);

    completarAte(json, 7);
    expect(etapaParaRetomar(json)).toBe(8);
  });

  it('tudo completo abre na nona, onde fica o envio', () => {
    const json = documentoVazio();
    completarAte(json, 9);
    expect(etapaParaRetomar(json)).toBe(9);
  });
});

describe('emPreenchimento', () => {
  it('só iniciado e pendente mantêm o formulário aberto', () => {
    expect(emPreenchimento('iniciado')).toBeTrue();
    expect(emPreenchimento('pendente')).toBeTrue();
    expect(emPreenchimento('aguardando_aprovacao')).toBeFalse();
    expect(emPreenchimento('aprovado')).toBeFalse();
    expect(emPreenchimento('rejeitado')).toBeFalse();
  });
});

describe('temConteudo', () => {
  it('documento em branco nao tem conteudo', () => {
    expect(temConteudo(documentoVazio())).toBeFalse();
  });

  it('espaco em branco nao conta como conteudo', () => {
    const json = documentoVazio();
    json['3'].sumario_executivo = '   ';
    expect(temConteudo(json)).toBeFalse();
  });

  it('texto, membro ou anexo contam', () => {
    const comTexto = documentoVazio();
    comTexto['2'].business_canvas = 'a';
    expect(temConteudo(comTexto)).toBeTrue();

    const comAnexo = documentoVazio();
    comAnexo['9'].arquivos = [anexo('x.csv')];
    expect(temConteudo(comAnexo)).toBeTrue();
  });

  it('a nota do avaliador nao conta como conteudo do incubado', () => {
    const json = documentoVazio();
    json['1'].nota = { valor: 5, texto: 'otimo', avaliador: 'consultor@teccampos.com' };
    expect(temConteudo(json)).toBeFalse();
  });
});

describe('normalizar', () => {
  it('completa as abas que o JSONB não trouxe', () => {
    const parcial = {
      status_questionario: 'pendente',
      json_questionario: { '2': { business_canvas: 'texto' } },
    } as unknown as Questionario;

    const json = normalizar(parcial).json_questionario;
    expect(json['2'].business_canvas).toBe('texto');
    expect(json['2'].nota).toEqual({ valor: null, texto: '', avaliador: null });
    expect(json['9'].arquivos).toEqual([]);
  });

  it('aguenta json_questionario nulo', () => {
    const nulo = {
      status_questionario: 'iniciado',
      json_questionario: null,
    } as unknown as Questionario;
    expect(normalizar(nulo).json_questionario['1'].nome_proponente).toBe('');
  });
});

describe('QuestionarioService', () => {
  let service: QuestionarioService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(QuestionarioService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('busca o questionário do usuário logado', () => {
    let recebido: Questionario | undefined;
    service.meu().subscribe((plano) => (recebido = plano));

    const req = backend.expectOne('/api/questionario');
    expect(req.request.method).toBe('GET');
    req.flush(resposta(documentoVazio()));

    expect(recebido?.status_questionario).toBe('pendente');
  });

  it('cria o documento quando o GET responde false', () => {
    let recebido: Questionario | undefined;
    service.meu().subscribe((plano) => (recebido = plano));

    backend.expectOne('/api/questionario').flush(false);

    const criacao = backend.expectOne('/api/questionario');
    expect(criacao.request.method).toBe('POST');
    expect(criacao.request.body.status_questionario).toBe('iniciado');
    expect(criacao.request.body.json_questionario['1'].nome_proponente).toBe('');

    criacao.flush({ status_questionario: 'iniciado', json_questionario: documentoVazio() });
    expect(recebido?.status_questionario).toBe('iniciado');
  });

  it('documento em branco continua iniciado, mesmo ao salvar', () => {
    service.salvar(documentoVazio()).subscribe();

    const req = backend.expectOne('/api/questionario');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.status_questionario).toBe('iniciado');
    req.flush(resposta(documentoVazio()));
  });

  it('salva o documento inteiro com PUT, promovendo para pendente', () => {
    const json = documentoVazio();
    json['2'].business_canvas = 'texto do canvas';
    service.salvar(json).subscribe();

    const req = backend.expectOne('/api/questionario');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.status_questionario).toBe('pendente');
    expect(req.request.body.json_questionario['2'].business_canvas).toBe('texto do canvas');
    req.flush(resposta(json));
  });

  it('o envio final troca o status para aguardando_aprovacao', () => {
    service.enviar(documentoVazio()).subscribe();

    const req = backend.expectOne('/api/questionario');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.status_questionario).toBe('aguardando_aprovacao');
    req.flush(resposta(documentoVazio()));
  });

  describe('cache do plano', () => {
    it('busca uma vez e reaproveita nas chamadas seguintes', () => {
      service.meu().subscribe();
      backend.expectOne('/api/questionario').flush(resposta(documentoVazio()));

      service.meu().subscribe();
      backend.expectNone('/api/questionario');
    });

    it('guardar atualiza o que esta em cache, sem novo GET', () => {
      service.meu().subscribe();
      backend.expectOne('/api/questionario').flush(resposta(documentoVazio()));

      service.enviar(documentoVazio()).subscribe();
      backend.expectOne('/api/questionario').flush({
        status_questionario: 'aguardando_aprovacao',
        json_questionario: documentoVazio(),
      });

      let depois: Questionario | undefined;
      service.meu().subscribe((p) => (depois = p));
      backend.expectNone('/api/questionario');
      expect(depois?.status_questionario).toBe('aguardando_aprovacao');
    });

    it('recarregar ignora o cache e vai ao servidor', () => {
      service.meu().subscribe();
      backend.expectOne('/api/questionario').flush(resposta(documentoVazio()));

      service.recarregar().subscribe();
      backend.expectOne('/api/questionario').flush(resposta(documentoVazio()));
    });

    it('esquecer limpa o plano da sessao anterior', () => {
      service.meu().subscribe();
      backend.expectOne('/api/questionario').flush(resposta(documentoVazio()));

      service.esquecer();

      service.meu().subscribe();
      backend.expectOne('/api/questionario').flush(resposta(documentoVazio()));
    });
  });
});
