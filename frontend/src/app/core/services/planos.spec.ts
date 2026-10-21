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
    service.plano('ana+teste@teccampos.com').subscribe();
    const pedido = http.expectOne((req) => req.url.startsWith('/api/usuarios/'));
    expect(pedido.request.url).toBe('/api/usuarios/ana%2Bteste%40teccampos.com/plano');
    pedido.flush({ status_questionario: 'aguardando_aprovacao', json_questionario: {} });
  });

  it('normaliza o documento vindo do servidor, como no plano proprio', () => {
    let json: unknown;
    service.plano('ana@teccampos.com').subscribe((plano) => (json = plano.json_questionario));

    http.expectOne('/api/usuarios/ana%40teccampos.com/plano').flush({
      status_questionario: 'aguardando_aprovacao',
      json_questionario: { '2': { business_canvas: 'texto' } },
    });

    // As nove abas chegam completas e com `avaliacao`, mesmo faltando no JSONB.
    expect((json as Record<string, { avaliacao: unknown }>)['9'].avaliacao).toBeNull();
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

    it('decidir exige as nove etapas avaliadas', () => {
      eu = admin;
      let erro: ApiError | undefined;
      service
        .decidir('ana@teccampos.com', { status: 'aprovado', justificativa: '' })
        .subscribe({ error: (e: ApiError) => (erro = e) });
      http.expectOne('/api/questionario/todos').flush(planoDaAna());

      expect(erro?.code).toBe('ETAPAS_PENDENTES');
    });

    it('decidir muda o status e guarda quem decidiu e por que', () => {
      eu = admin;
      const todos = planoDaAna();
      const json = todos[0].json_questionario as JsonQuestionario;
      for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
        json[String(n) as '1'].avaliacao = { avaliador: 'a@x', nota: 4, comentario: '' };
      }
      service
        .decidir('ana@teccampos.com', {
          status: 'rejeitado',
          justificativa: ' Faltou o financeiro. ',
        })
        .subscribe();
      http.expectOne('/api/questionario/todos').flush(todos);

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

    it('o avaliador nao decide', () => {
      eu = avaliador;
      let erro: ApiError | undefined;
      service
        .decidir('ana@teccampos.com', { status: 'aprovado', justificativa: '' })
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

    it('decidir recusa plano que nao esta em analise', () => {
      eu = admin;
      let erro: ApiError | undefined;
      service
        .decidir('ana@teccampos.com', { status: 'aprovado', justificativa: '' })
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
