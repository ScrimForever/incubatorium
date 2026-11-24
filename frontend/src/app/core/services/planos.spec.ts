import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ApiError, SessionUser } from '../models/auth';
import { PlanoResumo } from '../models/plano';
import {
  JsonQuestionario,
  Questionario,
  QuestionarioEntrada,
  documentoVazio,
} from '../models/questionario';
import { Auth } from './auth';
import { PlanosService } from './planos';

const conta = (email: string, role: SessionUser['role']): SessionUser =>
  ({ email, role }) as SessionUser;
const avaliador = conta('ana.avaliadora@teccampos.com', 'avaliador');
const admin = conta('coordenacao@teccampos.com', 'admin');
/** Quem está logado no teste; cada caso escolhe antes de chamar o service. */
let eu: SessionUser = avaliador;

describe('PlanosService', () => {
  let service: PlanosService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Auth, useValue: { me: () => of(eu) } },
      ],
    });
    service = TestBed.inject(PlanosService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Dois planos como a API devolve: a linha inteira, documento junto. */
  const TODOS = [
    {
      id: 1,
      usuario_email: 'ana@teccampos.com',
      status_questionario: 'aguardando_aprovacao',
      criado_em: '2026-09-10T12:00:00Z',
      atualizado_em: null,
      json_questionario: { '1': { nome_proponente: 'Ana Souza', nome_negocio: 'NutriData' } },
    },
    {
      id: 2,
      usuario_email: 'bruno@teccampos.com',
      status_questionario: 'iniciado',
      criado_em: '2026-09-12T15:20:00Z',
      json_questionario: {},
    },
  ];

  it('filtra por status na tela, porque a rota devolve todos', () => {
    let lista: PlanoResumo[] = [];
    service.listar('aguardando_aprovacao').subscribe((planos) => (lista = planos));
    http.expectOne('/api/questionario/todos').flush(TODOS);

    expect(lista.map((plano) => plano.usuario_email)).toEqual(['ana@teccampos.com']);
  });

  it('resume cada plano com os nomes da etapa 1, vazios quando ela falta', () => {
    let lista: PlanoResumo[] = [];
    service.listar().subscribe((planos) => (lista = planos));
    http.expectOne('/api/questionario/todos').flush(TODOS);

    expect(lista).toEqual([
      {
        usuario_email: 'ana@teccampos.com',
        status_questionario: 'aguardando_aprovacao',
        criado_em: '2026-09-10T12:00:00Z',
        atualizado_em: null,
        nome_proponente: 'Ana Souza',
        nome_negocio: 'NutriData',
      },
      {
        usuario_email: 'bruno@teccampos.com',
        status_questionario: 'iniciado',
        criado_em: '2026-09-12T15:20:00Z',
        atualizado_em: null,
        nome_proponente: '',
        nome_negocio: '',
      },
    ]);
  });

  it('o false da rota (falha de banco) vira lista vazia', () => {
    let lista: PlanoResumo[] | undefined;
    service.listar().subscribe((planos) => (lista = planos));
    http.expectOne('/api/questionario/todos').flush(false);

    expect(lista).toEqual([]);
  });

  it('escapa o e-mail na URL do plano', () => {
    eu = admin;
    service.plano('ana+teste@teccampos.com').subscribe();
    const pedido = http.expectOne((req) => req.url.startsWith('/api/usuarios/'));
    expect(pedido.request.url).toBe('/api/usuarios/ana%2Bteste%40teccampos.com/plano');
    pedido.flush({ status_questionario: 'aguardando_aprovacao', json_questionario: {} });
  });

  it('normaliza o documento vindo do servidor, como no plano proprio', () => {
    eu = admin;
    let json: unknown;
    service.plano('ana@teccampos.com').subscribe((plano) => (json = plano.json_questionario));

    http.expectOne('/api/usuarios/ana%40teccampos.com/plano').flush({
      status_questionario: 'aguardando_aprovacao',
      json_questionario: { '2': { business_canvas: 'texto' } },
    });

    // As nove abas chegam completas e com `avaliacao`, mesmo faltando no JSONB.
    expect((json as Record<string, { avaliacao: unknown }>)['9'].avaliacao).toBeNull();
  });

  it('consultor designado abre o plano', () => {
    eu = avaliador;
    let aberto = false;
    service.plano('ana@teccampos.com').subscribe(() => (aberto = true));
    http.expectOne('/api/questionario/todos').flush(TODOS);
    http
      .expectOne('/api/usuarios/ana%40teccampos.com/plano')
      .flush({ status_questionario: 'aprovado', json_questionario: {} });
    expect(aberto).toBeTrue();
  });

  it('consultor não designado não abre o plano, mesmo que o backend deixe', () => {
    eu = avaliador;
    let erro: ApiError | undefined;
    service.plano('outra@teccampos.com').subscribe({ error: (e: ApiError) => (erro = e) });
    http.expectOne('/api/questionario/todos').flush(TODOS);
    http.expectNone('/api/usuarios/outra%40teccampos.com/plano');
    expect(erro?.code).toBe('NAO_DESIGNADO');
  });

  describe('pdf', () => {
    it('acha o id pelo /todos e baixa o PDF do backend', () => {
      let pdf: Blob | undefined;
      service.pdf('bruno@teccampos.com').subscribe((conteudo) => (pdf = conteudo));
      http.expectOne('/api/questionario/todos').flush(TODOS);
      const req = http.expectOne('/api/relatorios/questionario/2');
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob(['%PDF'], { type: 'application/pdf' }));

      expect(pdf?.type).toBe('application/pdf');
    });

    it('plano fora do /todos (não designado) não pede o PDF', () => {
      let erro: ApiError | undefined;
      service.pdf('outro@teccampos.com').subscribe({ error: (e: ApiError) => (erro = e) });
      http.expectOne('/api/questionario/todos').flush(TODOS);

      expect(erro?.code).toBe('PLANO_NAO_ENCONTRADO');
    });
  });

  describe('escritas: relem o plano e gravam pelo id', () => {
    /** O plano da Ana como o `/todos` devolve, já com uma etapa avaliada por outro. */
    function planoDaAna(status = 'aguardando_aprovacao') {
      const json = documentoVazio();
      json['1'].nome_negocio = 'NutriData';
      json['2'].avaliacao = { avaliador: 'outro@teccampos.com', nota: 3, comentario: '' };
      return [
        {
          id: 7,
          usuario_email: 'ana@teccampos.com',
          status_questionario: status,
          json_questionario: json,
        },
        TODOS[1],
      ];
    }

    function gravacao(): TestRequest {
      const pedido = http.expectOne('/api/questionario/7');
      expect(pedido.request.method).toBe('PUT');
      return pedido;
    }

    /** O servidor devolve o que gravou, sem `id` nem `usuario_email`. */
    const ecoar = (pedido: TestRequest): void => pedido.flush(pedido.request.body);

    it('avaliar assina com quem esta logado e nao mexe no status', () => {
      eu = avaliador;
      let plano: Questionario | undefined;
      service
        .avaliar('ana@teccampos.com', { aba: 6, nota: 4, comentario: 'ok' })
        .subscribe((p) => (plano = p));
      http.expectOne('/api/questionario/todos').flush(planoDaAna());

      const pedido = gravacao();
      const corpo = pedido.request.body as QuestionarioEntrada;
      expect(corpo.status_questionario).toBe('aguardando_aprovacao');
      expect(corpo.json_questionario['6'].avaliacao).toEqual({
        avaliador: 'ana.avaliadora@teccampos.com',
        nota: 4,
        comentario: 'ok',
      });
      // O resto do documento vai como o servidor tinha: o PUT substitui tudo.
      expect(corpo.json_questionario['1'].nome_negocio).toBe('NutriData');
      expect(corpo.json_questionario['2'].avaliacao?.avaliador).toBe('outro@teccampos.com');
      ecoar(pedido);
      expect(plano?.usuario_email).toBe('ana@teccampos.com');
    });

    it('avaliar etapa que ja tem nota de outro e recusado antes de gravar', () => {
      eu = avaliador;
      let erro: ApiError | undefined;
      service
        .avaliar('ana@teccampos.com', { aba: 2, nota: 5, comentario: '' })
        .subscribe({ error: (e: ApiError) => (erro = e) });
      http.expectOne('/api/questionario/todos').flush(planoDaAna());

      http.expectNone('/api/questionario/7');
      expect(erro?.code).toBe('ETAPA_JA_AVALIADA');
    });

    it('a coordenacao nao avalia nem pede ajuste', () => {
      eu = admin;
      const erros: string[] = [];
      const guardar = { error: (e: ApiError) => erros.push(e.code) };
      service.avaliar('ana@teccampos.com', { aba: 6, nota: 4, comentario: '' }).subscribe(guardar);
      service.pedirAjuste('ana@teccampos.com', { aba: 6, mensagem: 'x' }).subscribe(guardar);
      http.match('/api/questionario/todos').forEach((pedido) => pedido.flush(planoDaAna()));

      http.expectNone('/api/questionario/7');
      expect(erros).toEqual(['AVALIACAO_RESTRITA_CONSULTOR', 'AJUSTE_RESTRITO_AVALIADOR']);
    });

    it('pedirAjuste grava o pedido assinado e devolve o plano a pendente', () => {
      eu = avaliador;
      service
        .pedirAjuste('ana@teccampos.com', { aba: 6, mensagem: '  Faltam os preços. ' })
        .subscribe();
      http.expectOne('/api/questionario/todos').flush(planoDaAna());

      const pedido = gravacao();
      const corpo = pedido.request.body as QuestionarioEntrada;
      expect(corpo.status_questionario).toBe('pendente');
      expect(corpo.json_questionario['6'].ajuste?.mensagem).toBe('Faltam os preços.');
      expect(corpo.json_questionario['6'].ajuste?.avaliador).toBe('ana.avaliadora@teccampos.com');
      ecoar(pedido);
    });

    it('pedirAjuste recusa plano que nao esta em analise', () => {
      eu = avaliador;
      let erro: ApiError | undefined;
      service
        .pedirAjuste('ana@teccampos.com', { aba: 6, mensagem: 'x' })
        .subscribe({ error: (e: ApiError) => (erro = e) });
      http.expectOne('/api/questionario/todos').flush(planoDaAna('aprovado'));

      expect(erro?.code).toBe('PLANO_FORA_DE_ANALISE');
    });

    it('devolver não exige nota: grava rejeitado com o motivo e quem devolveu', () => {
      eu = admin;
      service.devolver('ana@teccampos.com', ' Faltou o financeiro. ').subscribe();
      http.expectOne('/api/questionario/todos').flush(planoDaAna());

      const pedido = gravacao();
      const corpo = pedido.request.body as QuestionarioEntrada;
      expect(corpo.status_questionario).toBe('rejeitado');
      expect(corpo.json_questionario.decisao).toEqual(
        jasmine.objectContaining({
          status: 'rejeitado',
          por: 'coordenacao@teccampos.com',
          justificativa: 'Faltou o financeiro.',
        }),
      );
      ecoar(pedido);
    });

    it('devolver sem motivo não grava', () => {
      eu = admin;
      let erro: ApiError | undefined;
      service
        .devolver('ana@teccampos.com', '   ')
        .subscribe({ error: (e: ApiError) => (erro = e) });
      http.expectOne('/api/questionario/todos').flush(planoDaAna());

      http.expectNone('/api/questionario/7');
      expect(erro?.code).toBe('JUSTIFICATIVA_OBRIGATORIA');
    });

    it('o avaliador nao devolve', () => {
      eu = avaliador;
      let erro: ApiError | undefined;
      service
        .devolver('ana@teccampos.com', 'motivo')
        .subscribe({ error: (e: ApiError) => (erro = e) });
      http.expectOne('/api/questionario/todos').flush(planoDaAna());

      expect(erro?.code).toBe('DECISAO_RESTRITA_COORDENACAO');
    });

    it('corrigir troca so as respostas: nota, ajuste, anexo e status ficam', () => {
      eu = admin;
      const corrigido = documentoVazio();
      corrigido['1'].nome_negocio = 'NutriData Corrigida';
      // O que a tela mandar nestes campos não vale: são de quem avalia e do disco.
      corrigido['2'].avaliacao = null;
      corrigido['6'].arquivos = [{ nome: 'falso.pdf', tipo: 'application/pdf', tamanho: 1 }];
      const todos = planoDaAna();
      (todos[0].json_questionario as JsonQuestionario)['6'].arquivos = [
        { nome: 'real.pdf', tipo: 'application/pdf', tamanho: 9 },
      ];
      service.corrigir('ana@teccampos.com', corrigido).subscribe();
      http.expectOne('/api/questionario/todos').flush(todos);

      const pedido = gravacao();
      const corpo = pedido.request.body as QuestionarioEntrada;
      expect(corpo.status_questionario).toBe('aguardando_aprovacao');
      expect(corpo.json_questionario['1'].nome_negocio).toBe('NutriData Corrigida');
      expect(corpo.json_questionario['2'].avaliacao?.avaliador).toBe('outro@teccampos.com');
      expect(corpo.json_questionario['6'].arquivos.map((a) => a.nome)).toEqual(['real.pdf']);
      ecoar(pedido);
    });

    it('devolver recusa plano que nao esta em analise', () => {
      eu = admin;
      let erro: ApiError | undefined;
      service
        .devolver('ana@teccampos.com', 'motivo')
        .subscribe({ error: (e: ApiError) => (erro = e) });
      http.expectOne('/api/questionario/todos').flush(planoDaAna('pendente'));

      http.expectNone('/api/questionario/7');
      expect(erro?.code).toBe('PLANO_FORA_DE_DECISAO');
    });

    it('reabrir leva o plano devolvido a pendente e guarda o motivo', () => {
      eu = admin;
      const todos = planoDaAna('rejeitado');
      const decisao = {
        status: 'rejeitado' as const,
        por: 'coordenacao@teccampos.com',
        em: '2026-10-20T12:00:00Z',
        justificativa: 'Faltou o financeiro.',
      };
      (todos[0].json_questionario as JsonQuestionario).decisao = decisao;
      let status: string | undefined;
      service.reabrir('ana@teccampos.com').subscribe((p) => (status = p.status_questionario));
      http.expectOne('/api/questionario/todos').flush(todos);

      const pedido = gravacao();
      const corpo = pedido.request.body as QuestionarioEntrada;
      expect(corpo.status_questionario).toBe('pendente');
      // O incubado lê o motivo enquanto corrige; ele sai só no reenvio.
      expect(corpo.json_questionario.decisao).toEqual(decisao);
      expect(corpo.json_questionario['2'].avaliacao?.avaliador).toBe('outro@teccampos.com');
      ecoar(pedido);
      expect(status).toBe('pendente');
    });

    it('reabrir recusa plano que nao foi devolvido', () => {
      eu = admin;
      let erro: ApiError | undefined;
      service.reabrir('ana@teccampos.com').subscribe({ error: (e: ApiError) => (erro = e) });
      http.expectOne('/api/questionario/todos').flush(planoDaAna('aprovado'));

      http.expectNone('/api/questionario/7');
      expect(erro?.code).toBe('PLANO_NAO_DEVOLVIDO');
    });

    it('so a coordenacao reabre', () => {
      eu = avaliador;
      let erro: ApiError | undefined;
      service.reabrir('ana@teccampos.com').subscribe({ error: (e: ApiError) => (erro = e) });
      http.expectOne('/api/questionario/todos').flush(planoDaAna('rejeitado'));

      http.expectNone('/api/questionario/7');
      expect(erro?.code).toBe('REABERTURA_RESTRITA_COORDENACAO');
    });

    it('designar só grava a designação: nenhum PUT, o status não muda', () => {
      eu = admin;
      let feito = false;
      service
        .designar('ana@teccampos.com', ['carla@teccampos.com'])
        .subscribe(() => (feito = true));
      http.expectOne('/api/questionario/todos').flush(planoDaAna());

      const designacao = http.expectOne('/api/questionario-selecionado-avaliadores');
      expect(designacao.request.method).toBe('POST');
      expect(designacao.request.body).toEqual({
        questionario_id: 7,
        avaliadores: ['carla@teccampos.com'],
      });
      designacao.flush({});
      http.expectNone('/api/questionario/7');
      expect(feito).toBeTrue();
    });

    it('designar recusa lista vazia e quem nao e da coordenacao', () => {
      const erros: string[] = [];
      const guardar = { error: (e: ApiError) => erros.push(e.code) };
      eu = admin;
      service.designar('ana@teccampos.com', []).subscribe(guardar);
      http.expectOne('/api/questionario/todos').flush(planoDaAna());
      eu = avaliador;
      service.designar('ana@teccampos.com', ['c@teccampos.com']).subscribe(guardar);
      http.expectOne('/api/questionario/todos').flush(planoDaAna());

      http.expectNone('/api/questionario-selecionado-avaliadores');
      expect(erros).toEqual(['AVALIADOR_OBRIGATORIO', 'DECISAO_RESTRITA_COORDENACAO']);
    });

    it('aprovar exige as nove etapas avaliadas', () => {
      eu = admin;
      let erro: ApiError | undefined;
      service.aprovar('ana@teccampos.com').subscribe({ error: (e: ApiError) => (erro = e) });
      http.expectOne('/api/questionario/todos').flush(planoDaAna());

      http.expectNone('/api/questionario/7');
      expect(erro?.code).toBe('ETAPAS_PENDENTES');
    });

    it('aprovar com as nove notas grava aprovado e quem aprovou', () => {
      eu = admin;
      const todos = planoDaAna();
      const json = todos[0].json_questionario as JsonQuestionario;
      for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
        json[String(n) as '1'].avaliacao = { avaliador: 'a@x', nota: 4, comentario: '' };
      }
      let plano: Questionario | undefined;
      service.aprovar('ana@teccampos.com').subscribe((p) => (plano = p));
      http.expectOne('/api/questionario/todos').flush(todos);

      const pedido = gravacao();
      const corpo = pedido.request.body as QuestionarioEntrada;
      expect(corpo.status_questionario).toBe('aprovado');
      expect(corpo.json_questionario.decisao?.por).toBe('coordenacao@teccampos.com');
      ecoar(pedido);
      expect(plano?.status_questionario).toBe('aprovado');
    });

    it('plano que sumiu da lista vira erro, sem gravar', () => {
      eu = avaliador;
      let erro: ApiError | undefined;
      service
        .avaliar('ninguem@teccampos.com', { aba: 6, nota: 4, comentario: '' })
        .subscribe({ error: (e: ApiError) => (erro = e) });
      http.expectOne('/api/questionario/todos').flush(planoDaAna());

      expect(erro?.code).toBe('PLANO_NAO_ENCONTRADO');
    });
  });
});
