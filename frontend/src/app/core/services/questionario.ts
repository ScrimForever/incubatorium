import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { API_ROUTES } from '../constants/api-routes';
import { Api } from '../http/api';
import { ApiError } from '../models/auth';
import {
  ChaveEtapa,
  JsonQuestionario,
  NUMEROS_ETAPA,
  Avaliacao,
  NumeroEtapa,
  Questionario,
  QuestionarioEntrada,
  STATUS_EM_PREENCHIMENTO,
  StatusQuestionario,
  documentoVazio,
} from '../models/questionario';

/**
 * Service do Questionário Plano de Negócios. Três peculiaridades da API morrem
 * aqui: `GET` responde `200 false` quando não há documento (`meu()` cria com
 * `POST`); `POST` responde `409` se já existe; `PUT` substitui o
 * `json_questionario` inteiro, sem merge — toda gravação manda o documento completo.
 */
@Injectable({ providedIn: 'root' })
export class QuestionarioService {
  private readonly api = inject(Api);

  /**
   * O plano guardado desta sessão: guards e página pedem o mesmo documento.
   * Toda gravação atualiza o guardado com a resposta do servidor; mudança feita
   * por fora aparece no próximo carregamento ou via `recarregar()`.
   */
  private plano: Questionario | null = null;
  /** A requisição em voo, para chamadas simultâneas não virarem duas. */
  private emVoo: Observable<Questionario> | null = null;

  /** O plano do usuário logado, criando-o no primeiro acesso. */
  meu(): Observable<Questionario> {
    if (this.plano) {
      return of(this.plano);
    }
    this.emVoo ??= this.api.get<Questionario | false>(API_ROUTES.questionario).pipe(
      switchMap((resposta) => (resposta ? of(normalizar(resposta)) : this.criar())),
      tap((plano) => this.guardar(plano)),
      catchError((erro: unknown) => {
        this.emVoo = null;
        return throwError(() => erro);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.emVoo;
  }

  /** Descarta o que está guardado e busca de novo no servidor. */
  recarregar(): Observable<Questionario> {
    this.esquecer();
    return this.meu();
  }

  /** Sessão trocou: o plano guardado é de outra pessoa. */
  esquecer(): void {
    this.plano = null;
    this.emVoo = null;
  }

  private guardar(plano: Questionario): void {
    this.plano = plano;
    this.emVoo = null;
  }

  /**
   * Grava o documento. O status acompanha o conteúdo: documento em branco é
   * `iniciado`, com qualquer coisa preenchida é `pendente`. Navegar entre abas
   * não promove o plano.
   */
  salvar(json: JsonQuestionario): Observable<Questionario> {
    return this.enviarDocumento(temConteudo(json) ? 'pendente' : 'iniciado', json);
  }

  /**
   * Envio final: o plano vai para análise; os pedidos de ajuste e a decisão de
   * uma devolução anterior saem. Confere o
   * status devolvido em vez de confiar no pedido: o `PUT` já ignorou o status
   * uma vez, e sem isto a tela seguiria para a análise e o guard a devolveria ao
   * formulário, calado.
   */
  enviar(json: JsonQuestionario): Observable<Questionario> {
    return this.enviarDocumento('aguardando_aprovacao', json).pipe(
      map((plano) => {
        if (plano.status_questionario !== 'aguardando_aprovacao') {
          throw ENVIO_NAO_REGISTRADO;
        }
        return plano;
      }),
    );
  }

  private criar(): Observable<Questionario> {
    const corpo: QuestionarioEntrada = {
      status_questionario: 'iniciado',
      json_questionario: documentoVazio(),
    };
    return this.api.post<Questionario>(API_ROUTES.questionario, corpo).pipe(map(normalizar));
  }

  private enviarDocumento(
    status: StatusQuestionario,
    json: JsonQuestionario,
  ): Observable<Questionario> {
    // O pedido de ajuste mora no documento e o PUT substitui o documento
    // inteiro: no rascunho ele vai de volta como veio, senão salvar o apagaria
    // antes da correção; no envio para análise ele sai, porque foi atendido. A
    // decisão de um plano devolvido e reaberto sai junto: a análise recomeça.
    const documento = { ...json } as Record<string, unknown>;
    if (status === 'aguardando_aprovacao') {
      delete documento['decisao'];
      for (const numero of NUMEROS_ETAPA) {
        const chave = String(numero) as ChaveEtapa;
        documento[chave] = { ...json[chave], ajuste: null };
      }
    }
    const corpo: QuestionarioEntrada = {
      status_questionario: status,
      json_questionario: documento as unknown as JsonQuestionario,
    };
    return this.api.put<Questionario>(API_ROUTES.questionario, corpo).pipe(
      map(normalizar),
      tap((plano) => this.guardar(plano)),
    );
  }
}

/** O servidor gravou o documento, mas não o status de envio. */
const ENVIO_NAO_REGISTRADO: ApiError = {
  code: 'ENVIO_NAO_REGISTRADO',
  message:
    'Suas respostas foram salvas, mas o servidor não registrou o envio para análise. ' +
    'Tente de novo mais tarde ou avise a coordenação.',
};

/**
 * Completa o documento com o que faltar: o `json_questionario` é JSONB livre e
 * pode voltar `null` ou num formato anterior. A tela nunca recebe aba faltando.
 */
export function normalizar(resposta: Questionario): Questionario {
  const vazio = documentoVazio();
  const recebido = (resposta.json_questionario ?? {}) as Partial<JsonQuestionario>;
  const json = Object.fromEntries(
    NUMEROS_ETAPA.map((numero) => {
      const chave = String(numero) as ChaveEtapa;
      return [chave, { ...vazio[chave], ...(recebido[chave] ?? {}) }];
    }),
  ) as unknown as JsonQuestionario;
  // Documento antigo pode trazer o conteúdo do anexo em base64; reduzir à ficha
  // tira esse peso do próximo PUT.
  for (const chave of ['6', '9'] as const) {
    json[chave].arquivos = json[chave].arquivos.map(({ nome, tipo, tamanho }) => ({
      nome,
      tipo,
      tamanho,
    }));
  }
  for (const numero of NUMEROS_ETAPA) {
    const aba = json[String(numero) as ChaveEtapa];
    aba.avaliacao = migrarAvaliacao(aba);
  }
  // A decisão não é etapa: o `Object.fromEntries` acima só reconstrói "1" a "9".
  if (recebido.decisao) {
    json.decisao = recebido.decisao;
  }
  return { ...resposta, json_questionario: json };
}

/**
 * Converte os formatos anteriores da avaliação (`nota` por aba e lista `notas[]`)
 * no objeto `avaliacao`; os campos velhos somem na primeira gravação. Entrada
 * vazia (`valor: null` sem texto) era só lugar reservado e não conta; da lista
 * sobra a primeira, porque a regra é uma nota por etapa.
 */
function migrarAvaliacao(aba: {
  avaliacao?: Avaliacao | null;
  notas?: AvaliacaoAntiga[];
  nota?: unknown;
}): Avaliacao | null {
  const lista = aba.notas;
  const antiga = aba.nota as AvaliacaoAntiga | undefined;
  // Os campos velhos saem sempre: deixados aqui, voltariam para o banco no PUT.
  delete aba.nota;
  delete aba.notas;

  if (aba.avaliacao) {
    return aba.avaliacao;
  }
  const origem = lista?.[0] ?? antiga;
  if (!origem || (origem.valor == null && !origem.texto?.trim())) {
    return null;
  }
  return {
    avaliador: origem.avaliador ?? 'avaliador não identificado',
    nota: origem.valor ?? null,
    comentario: origem.texto ?? '',
  };
}

/** O formato anterior, só para a conversão acima conseguir lê-lo. */
interface AvaliacaoAntiga {
  avaliador?: string;
  valor?: 1 | 2 | 3 | 4 | 5 | null;
  texto?: string;
}

const preenchido = (texto: string): boolean => texto.trim().length > 0;

/**
 * O documento tem alguma coisa dentro? Vale texto, membro de equipe ou anexo —
 * a avaliação não conta, porque não é conteúdo do incubado.
 */
export function temConteudo(json: JsonQuestionario): boolean {
  return NUMEROS_ETAPA.some((numero) => {
    const aba = json[String(numero) as ChaveEtapa] as unknown as Record<string, unknown>;
    return Object.entries(aba).some(([chave, valor]) => {
      // Sem esta saída a avaliação promoveria um plano vazio a `pendente`.
      if (chave === 'avaliacao' || chave === 'ajuste') {
        return false;
      }
      if (typeof valor === 'string') {
        return preenchido(valor);
      }
      return Array.isArray(valor) && valor.length > 0;
    });
  });
}

/** Nem toda etapa exige tudo: a 1 não cobra o CNPJ, e a 9 depende só do anexo. */
export function etapaCompleta(json: JsonQuestionario, numero: NumeroEtapa): boolean {
  switch (numero) {
    case 1:
      return (
        preenchido(json['1'].nome_proponente) &&
        preenchido(json['1'].nome_negocio) &&
        preenchido(json['1'].setor_atuacao)
      );
    case 2:
      return preenchido(json['2'].business_canvas);
    case 3:
      return preenchido(json['3'].sumario_executivo);
    case 4:
      return json['4'].equipe.length > 0;
    case 5:
      return preenchido(json['5'].planejamento_produto);
    case 6:
      return (
        preenchido(json['6'].fornecedores) &&
        preenchido(json['6'].concorrentes) &&
        preenchido(json['6'].analise_acao) &&
        json['6'].arquivos.length > 0
      );
    case 7:
      return preenchido(json['7'].planejamento_marketing);
    case 8:
      return preenchido(json['8'].planejamento_estrutura);
    case 9:
      return json['9'].arquivos.length > 0;
  }
}

/**
 * A etapa só abre quando todas as anteriores estão completas — não só a
 * imediatamente anterior, senão esvaziar a 4 deixaria a 6 aberta. Fechar é só
 * travar o caminho; o conteúdo segue inteiro no servidor.
 */
export function etapaAcessivel(json: JsonQuestionario, numero: NumeroEtapa): boolean {
  return NUMEROS_ETAPA.filter((anterior) => anterior < numero).every((anterior) =>
    etapaCompleta(json, anterior),
  );
}

/**
 * Onde reabrir o questionário: a primeira etapa incompleta, ou a última (onde
 * fica o botão de enviar). Nada é gravado: como a trilha é travada, as etapas
 * completas formam um prefixo, e a primeira incompleta é onde o incubado estava.
 */
export function etapaParaRetomar(json: JsonQuestionario): NumeroEtapa {
  // Plano devolvido com ajuste: abre onde o avaliador pediu, não no fim.
  return (
    etapasComAjuste(json)[0] ?? NUMEROS_ETAPA.find((numero) => !etapaCompleta(json, numero)) ?? 9
  );
}

/** As etapas com ajuste pedido, em ordem. */
export function etapasComAjuste(json: JsonQuestionario): NumeroEtapa[] {
  return NUMEROS_ETAPA.filter((numero) => !!json[String(numero) as ChaveEtapa].ajuste);
}

export function etapasCompletas(json: JsonQuestionario): number {
  return NUMEROS_ETAPA.filter((numero) => etapaCompleta(json, numero)).length;
}

export function progresso(json: JsonQuestionario): number {
  return Math.round((etapasCompletas(json) / NUMEROS_ETAPA.length) * 100);
}

/** O formulário ainda está aberto? `iniciado` e `pendente` dizem que sim. */
export function emPreenchimento(status: StatusQuestionario): boolean {
  return STATUS_EM_PREENCHIMENTO.includes(status);
}
