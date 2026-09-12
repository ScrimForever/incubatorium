import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { API_ROUTES } from '../constants/api-routes';
import { Api } from '../http/api';
import {
  Anexo,
  JsonQuestionario,
  NUMEROS_ETAPA,
  NumeroEtapa,
  Questionario,
  QuestionarioEntrada,
  STATUS_EM_PREENCHIMENTO,
  StatusQuestionario,
  documentoVazio,
} from '../models/questionario';

/**
 * Service do Questionário Plano de Negócios.
 *
 * Três peculiaridades da API morrem aqui dentro, para que nenhuma página
 * precise conhecê-las:
 *
 *  1. `GET /questionario` responde `200 false` quando o documento não existe —
 *     não é `404`. `meu()` traduz isso em: cria com `POST` e devolve o novo.
 *  2. `POST` responde `409` se o documento já existe. Por isso ele só é chamado
 *     depois do `GET` dizer que não há nada.
 *  3. `PUT` substitui `json_questionario` inteiro — não faz merge. Toda
 *     gravação manda o documento completo, nunca um pedaço.
 */
@Injectable({ providedIn: 'root' })
export class QuestionarioService {
  private readonly api = inject(Api);

  /**
   * O plano guardado desta sessão. Os guards e a página pediam o mesmo
   * documento a cada passo do redirect — um login rendia três `GET`.
   *
   * Toda gravação atualiza o que está guardado (é o próprio servidor quem
   * responde o documento novo), então o status nunca envelhece por dentro do
   * app. Mudança feita por fora — o avaliador aprovando, por exemplo — aparece
   * no próximo carregamento ou via `recarregar()`.
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

  /** Envio final: o plano sai das mãos do incubado e vai para análise. */
  enviar(json: JsonQuestionario): Observable<Questionario> {
    return this.enviarDocumento('aguardando_aprovacao', json);
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
    const corpo: QuestionarioEntrada = { status_questionario: status, json_questionario: json };
    return this.api.put<Questionario>(API_ROUTES.questionario, corpo).pipe(
      map(normalizar),
      tap((plano) => this.guardar(plano)),
    );
  }
}

/**
 * Completa o documento com o que faltar. O `json_questionario` é JSONB livre —
 * pode voltar `null`, vir de uma versão anterior do formato ou ter sido gravado
 * por outra ferramenta. A tela nunca recebe uma aba faltando.
 */
export function normalizar(resposta: Questionario): Questionario {
  const vazio = documentoVazio();
  const recebido = (resposta.json_questionario ?? {}) as Partial<JsonQuestionario>;
  const json = Object.fromEntries(
    NUMEROS_ETAPA.map((numero) => {
      const chave = String(numero) as keyof JsonQuestionario;
      return [chave, { ...vazio[chave], ...(recebido[chave] ?? {}) }];
    }),
  ) as unknown as JsonQuestionario;
  return { ...resposta, json_questionario: json };
}

const preenchido = (texto: string): boolean => texto.trim().length > 0;

/**
 * O documento tem alguma coisa dentro? Vale texto preenchido, membro de equipe
 * ou anexo — a nota do avaliador não conta, porque não é conteúdo do incubado.
 */
export function temConteudo(json: JsonQuestionario): boolean {
  return NUMEROS_ETAPA.some((numero) => {
    const aba = json[String(numero) as keyof JsonQuestionario] as unknown as Record<
      string,
      unknown
    >;
    return Object.entries(aba).some(([chave, valor]) => {
      if (chave === 'nota') {
        return false;
      }
      if (typeof valor === 'string') {
        return preenchido(valor);
      }
      return Array.isArray(valor) && valor.length > 0;
    });
  });
}

/**
 * Uma etapa está completa segundo as mesmas regras do sistema antigo
 * (`isStepComplete` do QuestionarioForm.jsx) — nem todas exigem tudo: a etapa 1
 * não cobra o CNPJ, e a 9 depende só do anexo.
 */
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
 * A etapa só abre quando **todas** as anteriores estão completas.
 *
 * A cascata importa: se o incubado voltar e esvaziar a etapa 4, as etapas 5 a 9
 * se fecham de novo, mesmo já preenchidas — ele precisa refazer a 4 antes de
 * seguir. Olhar só a etapa imediatamente anterior deixava um buraco: com a 4
 * vazia e a 5 cheia, a 6 continuava aberta.
 *
 * O conteúdo do que já foi respondido **não se perde**: fechar é só travar o
 * caminho; o documento segue inteiro no servidor.
 */
export function etapaAcessivel(json: JsonQuestionario, numero: NumeroEtapa): boolean {
  return NUMEROS_ETAPA.filter((anterior) => anterior < numero).every((anterior) =>
    etapaCompleta(json, anterior),
  );
}

/**
 * Onde reabrir o questionário: a primeira etapa incompleta — e a última quando
 * já estiver tudo pronto, que é onde fica o botão de enviar.
 *
 * É o que "retomar de onde parou" significa aqui. Nada disso é gravado: a
 * trilha é travada, então as etapas completas formam sempre um prefixo, e a
 * primeira incompleta é a etapa em que o incubado estava.
 */
export function etapaParaRetomar(json: JsonQuestionario): NumeroEtapa {
  return NUMEROS_ETAPA.find((numero) => !etapaCompleta(json, numero)) ?? 9;
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

/**
 * Lê o arquivo escolhido e devolve o anexo pronto para entrar no JSON.
 *
 * Base64 sem o prefixo `data:` — o prefixo é remontado na hora de baixar, a
 * partir de `tipo`, e guardá-lo duplicaria informação dentro do documento.
 */
export function lerAnexo(arquivo: File): Promise<Anexo> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = (): void => reject(new Error('Não foi possível ler o arquivo.'));
    leitor.onload = (): void => {
      const resultado = String(leitor.result);
      resolve({
        nome: arquivo.name,
        tipo: arquivo.type || 'application/octet-stream',
        tamanho: arquivo.size,
        conteudo_base64: resultado.slice(resultado.indexOf(',') + 1),
      });
    };
    leitor.readAsDataURL(arquivo);
  });
}
