import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, catchError, delay, map, of, switchMap, tap, throwError } from 'rxjs';
import { API_BASE, API_ROUTES } from '../constants/api-routes';
import { UserRead } from '../models/auth';
import { DecisaoEntrada, NotaEntrada, PlanoCorrecaoEntrada } from '../models/plano';
import {
  Avaliacao,
  ChaveEtapa,
  DecisaoPlano,
  JsonQuestionario,
  NUMEROS_ETAPA,
  Questionario,
} from '../models/questionario';
import { papelDaConta } from '../services/auth';
import { normalizar } from '../services/questionario';

/**
 * Backend falso da avaliação de planos, só em desenvolvimento. Leituras e papel
 * são reais; aqui só o que o backend não tem (`docs/contrato-avaliacao.md`):
 * `PATCH .../nota` (nota do avaliador), `PATCH .../status` (decisão da
 * coordenação) e `PUT /usuarios/{email}/plano` (a coordenação corrigindo as
 * respostas). O gravado fica no `localStorage`, aplicado por cima das leituras.
 *
 * O backend ainda recusa (`403`) o plano alheio à coordenação; nesse caso o mock
 * lê o mesmo documento no `/questionario/todos` real.
 *
 * Quando as rotas nascerem, apague este arquivo e o import em
 * `environments/environment.development.ts`.
 */

/** Marca procurável no bundle, para conferir que não vaza para produção. */
const MARCA = 'MOCK-AVALIACAO';

const CHAVE = `${MARCA}-v2`;
const LATENCIA_MS = 300;

const PLANO_ALHEIO = /\/usuarios\/([^/?]+)\/plano$/;
const ESCRITA = /\/questionario\/([^/?]+)\/(nota|status)$/;

interface Guardado {
  /** email do plano → aba → a avaliação daquela aba (uma só, como em produção) */
  notas: Record<string, Record<string, Avaliacao>>;
  /** email do plano → a decisão da coordenação, quando já houve uma */
  decisoes: Record<string, DecisaoPlano>;
  /** email do plano → aba → os campos que a coordenação corrigiu (sem nota nem anexo) */
  correcoes: Record<string, Record<string, Record<string, unknown>>>;
}

function ler(): Guardado {
  try {
    const dados = JSON.parse(localStorage.getItem(CHAVE) ?? '') as Partial<Guardado>;
    return {
      notas: dados.notas ?? {},
      decisoes: dados.decisoes ?? {},
      correcoes: dados.correcoes ?? {},
    };
  } catch {
    return { notas: {}, decisoes: {}, correcoes: {} };
  }
}

/**
 * As abas como a coordenação as mandou, menos o que a correção não pode tocar:
 * a nota é do avaliador e o anexo é do incubado (contrato, Parte 4).
 */
function camposCorrigiveis(json: JsonQuestionario): Record<string, Record<string, unknown>> {
  const abas: Record<string, Record<string, unknown>> = {};
  for (const numero of NUMEROS_ETAPA) {
    const aba = String(numero) as ChaveEtapa;
    const campos = { ...(json[aba] as unknown as Record<string, unknown>) };
    delete campos['avaliacao'];
    delete campos['arquivos'];
    abas[aba] = campos;
  }
  return abas;
}

function gravar(dados: Guardado): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(dados));
  } catch {
    // sem storage, a nota vale só para esta navegação
  }
}

/** O plano real, com as correções, as notas e a decisão que este mock já recebeu por cima. */
function aplicar(plano: Questionario, email: string): Questionario {
  const normalizado = normalizar(plano);
  const json = normalizado.json_questionario;
  const { notas, decisoes, correcoes } = ler();
  for (const [aba, campos] of Object.entries(correcoes[email] ?? {})) {
    Object.assign(json[aba as ChaveEtapa], campos);
  }
  // A nota gravada substitui a da etapa: é uma por etapa, e só o autor regrava.
  for (const [aba, avaliacao] of Object.entries(notas[email] ?? {})) {
    json[aba as ChaveEtapa].avaliacao = avaliacao;
  }
  const decisao = decisoes[email];
  if (decisao) {
    json.decisao = decisao;
  }
  return {
    ...normalizado,
    // Decidido manda: é a decisão que move o plano de `aguardando_aprovacao`.
    status_questionario: decisao?.status ?? normalizado.status_questionario,
    json_questionario: json,
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
  return NUMEROS_ETAPA.filter((numero) => json[String(numero) as ChaveEtapa].avaliacao !== null)
    .length;
}

const responder = <T>(corpo: T): Observable<HttpEvent<unknown>> =>
  of(new HttpResponse({ status: 200, body: corpo }) as HttpEvent<unknown>).pipe(delay(LATENCIA_MS));

/** Troca o corpo de uma resposta real, deixando passar os outros eventos. */
const trocarCorpo =
  <T>(trocar: (corpo: T) => unknown) =>
  (evento: HttpEvent<unknown>): HttpEvent<unknown> =>
    evento instanceof HttpResponse ? evento.clone({ body: trocar(evento.body as T) }) : evento;

/**
 * O plano de `email` como o servidor o tem — pela rota de plano alheio, e pelo
 * `/questionario/todos` quando ela recusa a coordenação.
 */
function planoReal(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  email: string,
): Observable<Questionario> {
  const leitura = req.clone({
    method: 'GET',
    url: `${API_BASE}${API_ROUTES.avaliacao.planoDe(email)}`,
    body: null,
  });
  return next(leitura).pipe(
    catchError((erro: unknown) =>
      erro instanceof HttpErrorResponse && erro.status === 403 && ehCoordenacao()
        ? doTodos(req, next, email)
        : throwError(() => erro),
    ),
    map((evento) => (evento instanceof HttpResponse ? (evento.body as Questionario) : null)),
    // Só a resposta final interessa; os eventos de progresso não trazem corpo.
    switchMap((plano) => (plano ? of(plano) : [])),
  );
}

function doTodos(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  email: string,
): Observable<HttpEvent<unknown>> {
  const todos = req.clone({
    method: 'GET',
    url: `${API_BASE}${API_ROUTES.avaliacao.planos}`,
    body: null,
  });
  return next(todos).pipe(
    switchMap((evento) => {
      if (!(evento instanceof HttpResponse)) {
        return of(evento);
      }
      const plano = ((evento.body as Questionario[] | false) || []).find(
        (item) => item.usuario_email === email,
      );
      return plano ? of(evento.clone({ body: plano })) : recusar(404, 'Not Found', req.url);
    }),
  );
}

export const avaliacaoMockInterceptor: HttpInterceptorFn = (req, next) => {
  const url = req.url;

  // O /users/me passa intacto: o mock só anota quem está logado, que é quem
  // assina a nota e quem decide.
  if (req.method === 'GET' && url.endsWith('/users/me')) {
    return next(req).pipe(
      tap((evento) => {
        if (evento instanceof HttpResponse) {
          usuarioLogado = evento.body as UserRead | null;
        }
      }),
    );
  }

  // Lista real; só a situação dos planos que a coordenação já decidiu muda.
  if (req.method === 'GET' && url.endsWith(API_ROUTES.avaliacao.planos)) {
    return next(req).pipe(
      map(
        trocarCorpo<Questionario[] | false>((planos) =>
          planos
            ? planos.map((plano) =>
                plano.usuario_email ? aplicar(plano, plano.usuario_email) : plano,
              )
            : planos,
        ),
      ),
    );
  }

  const alheio = req.method === 'GET' ? PLANO_ALHEIO.exec(url) : null;
  if (alheio) {
    const email = decodeURIComponent(alheio[1]);
    return planoReal(req, next, email).pipe(switchMap((plano) => responder(aplicar(plano, email))));
  }

  // A coordenação corrige as respostas. Nota, anexo e decisão ficam como estão.
  const correcao = req.method === 'PUT' ? PLANO_ALHEIO.exec(url) : null;
  if (correcao) {
    const email = decodeURIComponent(correcao[1]);
    if (!ehCoordenacao()) {
      return recusar(403, 'EDICAO_RESTRITA_COORDENACAO', req.url);
    }
    const entrada = req.body as PlanoCorrecaoEntrada;
    return planoReal(req, next, email).pipe(
      switchMap((plano) => {
        const dados = ler();
        dados.correcoes[email] = camposCorrigiveis(
          normalizar({
            ...plano,
            json_questionario: entrada.json_questionario,
          }).json_questionario,
        );
        gravar(dados);
        return responder(aplicar(plano, email));
      }),
    );
  }

  const escrita = req.method === 'PATCH' ? ESCRITA.exec(url) : null;
  if (!escrita) {
    return next(req);
  }
  const email = decodeURIComponent(escrita[1]);
  const quem = usuarioLogado?.email ?? '';

  if (escrita[2] === 'nota') {
    const entrada = req.body as NotaEntrada;
    // Quem decide não avalia: a separação dos papéis vale também no servidor.
    if (ehCoordenacao()) {
      return recusar(403, 'AVALIACAO_RESTRITA_CONSULTOR', req.url);
    }
    return planoReal(req, next, email).pipe(
      switchMap((plano) => {
        // Uma nota por etapa: o primeiro avaliador fecha a etapa, e só ele regrava.
        const aba = String(entrada.aba) as ChaveEtapa;
        const jaNoDocumento = aplicar(plano, email).json_questionario[aba].avaliacao;
        if (jaNoDocumento && jaNoDocumento.avaliador !== quem) {
          return recusar(409, 'ETAPA_JA_AVALIADA', req.url);
        }
        const dados = ler();
        dados.notas[email] = {
          ...(dados.notas[email] ?? {}),
          [aba]: { avaliador: quem, nota: entrada.nota, comentario: entrada.comentario },
        };
        gravar(dados);
        return responder(aplicar(plano, email));
      }),
    );
  }

  // Aprovar ou devolver. As três recusas são as que o backend precisa ter.
  const entrada = req.body as DecisaoEntrada;
  if (!ehCoordenacao()) {
    return recusar(403, 'DECISAO_RESTRITA_COORDENACAO', req.url);
  }
  return planoReal(req, next, email).pipe(
    switchMap((plano) => {
      if (etapasAvaliadas(aplicar(plano, email).json_questionario) < NUMEROS_ETAPA.length) {
        return recusar(409, 'ETAPAS_PENDENTES', req.url);
      }
      const justificativa = entrada.justificativa.trim();
      if (entrada.status === 'rejeitado' && !justificativa) {
        return recusar(400, 'JUSTIFICATIVA_OBRIGATORIA', req.url);
      }
      const dados = ler();
      dados.decisoes[email] = {
        status: entrada.status,
        por: quem,
        em: new Date().toISOString(),
        justificativa: entrada.status === 'rejeitado' ? justificativa : '',
      };
      gravar(dados);
      return responder(aplicar(plano, email));
    }),
  );
};

/**
 * Quem está logado, anotado do `/users/me` real. O `sub` do JWT é o id, não o
 * e-mail, e injetar o `Auth` criaria ciclo (ele passa por este interceptor).
 */
let usuarioLogado: UserRead | null = null;

/** A coordenação, pela mesma regra da sessão (`papelDaConta`). */
function ehCoordenacao(): boolean {
  return !!usuarioLogado && papelDaConta(usuarioLogado) === 'admin';
}
