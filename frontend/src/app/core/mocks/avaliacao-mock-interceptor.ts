import {
  HttpErrorResponse,
  HttpEvent,
  HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { Observable, delay, map, of, throwError } from 'rxjs';
import { UserRead } from '../models/auth';
import { DecisaoEntrada, NotaEntrada, PlanoResumo } from '../models/plano';
import {
  ChaveEtapa,
  DecisaoPlano,
  JsonQuestionario,
  NUMEROS_ETAPA,
  NotaEtapa,
  NumeroEtapa,
  Questionario,
  StatusQuestionario,
  documentoVazio,
} from '../models/questionario';

/**
 * Backend falso da avaliação de planos, só em desenvolvimento.
 *
 * Responde as três coisas que o backend ainda não publica, no shape combinado em
 * `docs/contrato-avaliacao.md`:
 *
 *  1. `GET /questionarios` — a lista de planos;
 *  2. `GET /questionario/{email}` — o documento de outra pessoa;
 *  3. `PATCH /questionario/{email}/nota` — a nota do avaliador;
 *  4. `PATCH /questionario/{email}/status` — aprovar ou devolver, só a
 *     coordenação.
 *
 * E mais uma, que é enriquecimento e não invenção: o `GET /users/me` **real**
 * passa por aqui e ganha os booleanos de papel que a API ainda não devolve, para
 * as contas de teste listadas em `PAPEIS`. Sem isso não existe avaliador para
 * entrar na tela — a API chama todo mundo de incubado.
 *
 * Avaliar continua não aprovando: a nota e a decisão são rotas separadas, e a
 * de decisão recusa quem não é admin, etapa faltando e devolução sem motivo —
 * as três travas que o backend vai precisar ter.
 *
 * Quando as rotas nascerem, apague este arquivo e a linha que o importa em
 * `environments/environment.development.ts`.
 */

/** Marca procurável no bundle, para conferir que não vaza para produção. */
const MARCA = 'MOCK-AVALIACAO';

const CHAVE = 'mock-avaliacao-v1';
const LATENCIA_MS = 300;

/**
 * Quem é avaliador enquanto o `UserRead` não tem papel. São contas que já
 * existem no Postgres local — o mock só acrescenta o que a API não devolve.
 */
const PAPEIS: Record<string, Partial<UserRead>> = {
  'avaliador@teccampos.com': {
    is_consultor: true,
    especialidade: 'Mercado',
    nome: 'Paula Ferreira',
  },
  'consultor@teccampos.com': {
    is_consultor: true,
    especialidade: 'Financeiro',
    nome: 'Ricardo Alves',
  },
  // Sem `especialidade`: a coordenação decide, não avalia, e não assina nota.
  'admin@teccampos.com': { is_admin: true },
};

/**
 * Os planos fictícios da lista. E-mail com a marca, para não confundir com real.
 * `nome_proponente`/`nome_negocio` ficam aqui e são reusados por `documentoDe()`,
 * para a lista e o detalhe nunca se contradizerem.
 */
const PLANOS: PlanoResumo[] = [
  {
    usuario_email: `${MARCA}-ana.startup@teccampos.com`,
    nome_proponente: 'Ana Souza',
    nome_negocio: 'NutriData',
    status_questionario: 'aguardando_aprovacao',
    criado_em: '2026-09-10T12:00:00.000Z',
    atualizado_em: '2026-09-18T09:30:00.000Z',
  },
  {
    usuario_email: `${MARCA}-bruno.agrotech@teccampos.com`,
    nome_proponente: 'Bruno Lima',
    nome_negocio: 'AgroSense',
    status_questionario: 'aguardando_aprovacao',
    criado_em: '2026-09-12T15:20:00.000Z',
    atualizado_em: null,
  },
  {
    usuario_email: `${MARCA}-clara.saude@teccampos.com`,
    nome_proponente: 'Clara Nunes',
    nome_negocio: 'VidaPlus',
    status_questionario: 'rejeitado',
    criado_em: '2026-08-28T11:05:00.000Z',
    atualizado_em: '2026-09-05T17:45:00.000Z',
  },
  // Um plano em cada situação: sem isto, três das cinco pílulas abririam
  // sempre vazias e não dava para conferir o filtro.
  {
    usuario_email: `${MARCA}-diego.edu@teccampos.com`,
    nome_proponente: 'Diego Rocha',
    nome_negocio: 'EduLab',
    status_questionario: 'aprovado',
    criado_em: '2026-08-14T09:10:00.000Z',
    atualizado_em: '2026-09-01T10:00:00.000Z',
  },
  {
    usuario_email: `${MARCA}-elisa.log@teccampos.com`,
    nome_proponente: 'Elisa Prado',
    nome_negocio: 'RotaCerta',
    status_questionario: 'pendente',
    criado_em: '2026-09-20T08:00:00.000Z',
    atualizado_em: '2026-09-24T19:30:00.000Z',
  },
  {
    usuario_email: `${MARCA}-felipe.fin@teccampos.com`,
    nome_proponente: 'Felipe Castro',
    nome_negocio: 'CaixaCerta',
    status_questionario: 'iniciado',
    criado_em: '2026-09-25T13:40:00.000Z',
    atualizado_em: null,
  },
];

const nota = (
  avaliador: string,
  especialidade: string,
  valor: NotaEtapa['valor'],
  texto: string,
  em: string,
  // O nome sai do cadastro, junto do e-mail — aqui, do mapa de papéis.
): NotaEtapa => ({ avaliador, nome: PAPEIS[avaliador]?.nome, especialidade, valor, texto, em });

/** Um documento preenchido, para a tela do avaliador ter o que ler. */
function documentoDe(email: string): JsonQuestionario {
  const json = documentoVazio();
  const resumo = PLANOS.find((plano) => plano.usuario_email === email);
  json['1'] = {
    ...json['1'],
    nome_proponente: resumo?.nome_proponente ?? '',
    nome_negocio: resumo?.nome_negocio ?? '',
    setor_atuacao: 'Tecnologia',
    cnpj: '12.345.678/0001-90',
  };
  json['2'].business_canvas = '<p>Proposta de valor, canais e parcerias descritos.</p>';
  json['3'].sumario_executivo = '<p>Resumo do negócio, do problema e da solução.</p>';
  json['5'].planejamento_produto = '<p>Roadmap de doze meses.</p>';
  json['6'] = {
    ...json['6'],
    fornecedores: '<p>Três fornecedores mapeados.</p>',
    concorrentes: '<p>Dois concorrentes diretos e um indireto.</p>',
    analise_acao: '<p>Diferencial por atendimento.</p>',
    // Fichas fictícias: a tela só exibe nome/tipo/tamanho (não há download), então
    // não há disco a reconciliar — é o anexo que o avaliador enxerga no mock.
    arquivos: [
      { nome: 'analise-concorrentes.pdf', tipo: 'application/pdf', tamanho: 184_320 },
      {
        nome: 'proposta-fornecedores.docx',
        tipo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        tamanho: 52_736,
      },
    ],
  };
  json['7'].planejamento_marketing =
    "<h2>Where can I get some?</h2><p>There are many variations of passages of Lorem Ipsum available, but the majority have suffered alteration in some form, by injected humour, or randomised words which don't look even slightly believable. If you are going to use a passage of Lorem Ipsum, you need to be sure there isn't anything embarrassing hidden in the middle of text. All the Lorem Ipsum generators on the Internet tend to repeat predefined chunks as necessary, making this the first true generator on the Internet. It uses a dictionary of over 200 Latin words, combined with a handful of model sentence structures, to generate Lorem Ipsum which looks reasonable. The generated Lorem Ipsum is therefore always free from repetition, injected humour, or non-characteristic words etc.</p>";
  json['8'].planejamento_estrutura = '<p>Time de quatro pessoas.</p>';
  json['9'].observacoes = '<p>Planilha financeira anexada.</p>';
  json['9'].arquivos = [
    {
      nome: 'projecao-financeira.xlsx',
      tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      tamanho: 96_512,
    },
  ];

  // Notas já no documento, uma por etapa: na prática a etapa é avaliada por um
  // consultor só — quem chega depois a encontra fechada (`etapaBloqueada`). O
  // que varia de etapa para etapa é o especialista, não a quantidade de notas.
  if (email.includes('ana.startup')) {
    json['2'].notas = [
      nota(
        'consultor@teccampos.com',
        'Financeiro',
        3,
        'Canvas claro, mas a receita não aparece.',
        '2026-09-18T09:30:00.000Z',
      ),
    ];
    json['6'].notas = [
      nota(
        'consultor@teccampos.com',
        'Financeiro',
        2,
        'Preço abaixo do custo apresentado na etapa 9.',
        '2026-09-18T09:32:00.000Z',
      ),
    ];
  }
  return json;
}

interface Guardado {
  /** email do plano → aba → a nota daquela aba (uma só, como em produção) */
  notas: Record<string, Record<string, NotaEtapa>>;
  /** email do plano → a decisão da coordenação, quando já houve uma */
  decisoes?: Record<string, DecisaoPlano>;
}

function ler(): Guardado {
  try {
    return (JSON.parse(localStorage.getItem(CHAVE) ?? '') as Guardado) ?? { notas: {} };
  } catch {
    return { notas: {} };
  }
}

function gravar(dados: Guardado): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(dados));
  } catch {
    // sem storage, a nota vale só para esta navegação
  }
}

/** O documento com as notas que este mock já recebeu, aplicadas por cima. */
function planoDe(email: string): Questionario {
  const json = documentoDe(email);
  // Nota assinada por quem é coordenação não entra: ela não avalia, e dado
  // antigo de teste não pode contradizer a regra na tela.
  const guardadas = Object.fromEntries(
    Object.entries(ler().notas[email] ?? {}).filter(
      ([, nota]) => !PAPEIS[nota.avaliador]?.is_admin,
    ),
  );
  // A nota gravada substitui a da etapa, não se soma a ela: a etapa tem uma nota
  // só, e quem a deu é quem pode regravar (a tela fecha a etapa para os outros).
  for (const [aba, nota] of Object.entries(guardadas)) {
    json[aba as ChaveEtapa].notas = [nota];
  }
  const resumo = PLANOS.find((plano) => plano.usuario_email === email);
  const decisao = ler().decisoes?.[email];
  if (decisao) {
    json.decisao = decisao;
  }
  return {
    usuario_email: email,
    // Decidido manda: é a decisão que move o plano de `aguardando_aprovacao`.
    status_questionario: decisao?.status ?? resumo?.status_questionario ?? 'aguardando_aprovacao',
    json_questionario: json,
    criado_em: resumo?.criado_em ?? null,
    atualizado_em: resumo?.atualizado_em ?? null,
  };
}

/** Recusa com o mesmo shape de erro da API (o error-interceptor lê `detail`). */
function recusar(status: number, detalhe: string, url: string): Observable<HttpEvent<unknown>> {
  return throwError(() => new HttpErrorResponse({ status, url, error: { detail: detalhe } })).pipe(
    delay(LATENCIA_MS),
  );
}

/** Quantas das nove etapas já têm nota — a conta que libera a decisão. */
function etapasAvaliadas(json: JsonQuestionario): number {
  return NUMEROS_ETAPA.filter((numero) => json[String(numero) as ChaveEtapa].notas.length > 0)
    .length;
}

const responder = <T>(corpo: T): Observable<HttpEvent<unknown>> =>
  of(new HttpResponse({ status: 200, body: corpo }) as HttpEvent<unknown>).pipe(delay(LATENCIA_MS));

export const avaliacaoMockInterceptor: HttpInterceptorFn = (req, next) => {
  const url = decodeURIComponent(req.url);

  // Enriquecimento do /users/me real: a resposta é da API, só ganha o papel.
  if (req.method === 'GET' && url.endsWith('/users/me')) {
    return next(req).pipe(
      map((evento) => {
        if (!(evento instanceof HttpResponse)) {
          return evento;
        }
        const user = evento.body as UserRead | null;
        if (!user) {
          return evento;
        }
        emailLogado = user.email;
        const extra = PAPEIS[user.email];
        return extra ? evento.clone({ body: { ...user, ...extra } }) : evento;
      }),
    );
  }

  if (req.method === 'GET' && url.includes('/questionarios')) {
    const status = new URL(url, 'http://local').searchParams.get('status');
    // A lista lê a decisão gravada: aprovado some de "Aguardando análise" na
    // hora, como aconteceria com o status vindo do banco.
    const decisoes = ler().decisoes ?? {};
    const planos = PLANOS.map((plano) => ({
      ...plano,
      status_questionario: (decisoes[plano.usuario_email]?.status ??
        plano.status_questionario) as StatusQuestionario,
    }));
    return responder(status ? planos.filter((p) => p.status_questionario === status) : planos);
  }

  // Só os planos que este mock inventou; e-mail real segue para a API — que vai
  // recusar, porque a rota não existe, e é assim que se percebe que falta backend.
  const planoDaUrl = PLANOS.find((plano) => url.includes(plano.usuario_email));
  if (!planoDaUrl) {
    return next(req);
  }
  const email = planoDaUrl.usuario_email;

  if (req.method === 'GET') {
    return responder(planoDe(email));
  }

  if (req.method === 'PATCH' && url.endsWith('/nota')) {
    const entrada = req.body as NotaEntrada;
    const dados = ler();
    // O avaliador sai do token, não do corpo — aqui, do que o mock sabe do
    // usuário logado. No backend será o `current_active_user`.
    const avaliador = avaliadorLogado();
    // Quem decide não avalia: a separação entre os dois papéis vale nas duas
    // direções, e não só na tela (que já não oferece o formulário ao admin).
    if (PAPEIS[avaliador]?.is_admin) {
      return recusar(403, 'AVALIACAO_RESTRITA_CONSULTOR', req.url);
    }
    // Uma nota por etapa: o primeiro avaliador fecha a etapa, e só ele regrava.
    // A tela já não oferece o formulário nesse caso (`etapaBloqueada`) — aqui é
    // a mesma regra do lado do servidor, que é onde ela precisa valer.
    const jaNoDocumento =
      planoDe(email).json_questionario[String(entrada.aba) as ChaveEtapa].notas[0];
    if (jaNoDocumento && jaNoDocumento.avaliador !== avaliador) {
      return recusar(409, 'ETAPA_JA_AVALIADA', req.url);
    }
    dados.notas[email] = {
      ...(dados.notas[email] ?? {}),
      [String(entrada.aba as NumeroEtapa)]: {
        avaliador,
        nome: PAPEIS[avaliador]?.nome,
        especialidade: entrada.especialidade,
        valor: entrada.valor,
        texto: entrada.texto,
        em: new Date().toISOString(),
      },
    };
    gravar(dados);
    return responder(planoDe(email));
  }

  // Aprovar ou devolver. As três recusas aqui são as que o backend precisa ter:
  // sem elas, a regra de quem decide viveria só na interface.
  if (req.method === 'PATCH' && url.endsWith('/status')) {
    const entrada = req.body as DecisaoEntrada;
    const quem = avaliadorLogado();
    if (!PAPEIS[quem]?.is_admin) {
      return recusar(403, 'DECISAO_RESTRITA_COORDENACAO', req.url);
    }
    const plano = planoDe(email);
    if (etapasAvaliadas(plano.json_questionario) < NUMEROS_ETAPA.length) {
      return recusar(409, 'ETAPAS_PENDENTES', req.url);
    }
    const justificativa = entrada.justificativa.trim();
    if (entrada.status === 'rejeitado' && !justificativa) {
      return recusar(400, 'JUSTIFICATIVA_OBRIGATORIA', req.url);
    }
    const dados = ler();
    dados.decisoes = {
      ...(dados.decisoes ?? {}),
      [email]: {
        status: entrada.status,
        por: quem,
        em: new Date().toISOString(),
        justificativa: entrada.status === 'rejeitado' ? justificativa : '',
      },
    };
    gravar(dados);
    return responder(planoDe(email));
  }

  return next(req);
};

/**
 * Quem está avaliando, na falta de servidor: o e-mail que o `/users/me` real
 * trouxe na passagem por aqui.
 *
 * Não serve ler o `sub` do JWT — no fastapi-users ele é o id, não o e-mail. E
 * não serve injetar o `Auth`, que depende do `Api`, que passa por este
 * interceptor. No backend isto será o `current_active_user`.
 */
let emailLogado = '';

function avaliadorLogado(): string {
  return emailLogado || 'avaliador@teccampos.com';
}
