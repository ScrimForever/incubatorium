import { Injectable, inject, signal } from '@angular/core';
import { Observable, forkJoin, map, switchMap, throwError } from 'rxjs';
import { API_ROUTES } from '../constants/api-routes';
import { Api } from '../http/api';
import { ApiError, SessionUser } from '../models/auth';
import { Avaliador, DesignacaoEntrada } from '../models/avaliador';
import { AjusteEntrada, NotaEntrada, PlanoResumo } from '../models/plano';
import {
  ChaveEtapa,
  ETAPAS_COM_AJUSTE,
  JsonQuestionario,
  NUMEROS_ETAPA,
  Questionario,
  QuestionarioEntrada,
  StatusQuestionario,
} from '../models/questionario';
import { Auth } from './auth';
import { etapasComAjuste, normalizar } from './questionario';

/**
 * Planos de negócio vistos por quem avalia. Separado do `QuestionarioService`
 * (o meu plano, com cache) para o cache de um não vazar no outro.
 *
 * O backend tem uma escrita só para o plano alheio: `PUT /questionario/{id}`,
 * que substitui o documento e o status e aceita consultor e coordenação, sem
 * regra nenhuma além disso. Por isso toda escrita aqui relê o plano, aplica a
 * mudança sobre a versão do servidor e confere as regras do produto antes de
 * gravar — avaliar não aprova, uma nota por etapa, só a coordenação decide.
 */
@Injectable({ providedIn: 'root' })
export class PlanosService {
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);

  /**
   * A aba escolhida na listagem de planos. Mora aqui (o service vive a sessão
   * inteira) para quem abre um plano e volta encontrar a lista como deixou.
   */
  readonly filtroLista = signal<StatusQuestionario | 'todos'>('todos');

  /**
   * De quem é o `filtroLista`. O service sobrevive ao logout: sem isto, quem
   * entra depois herda a aba da conta anterior (medido em 13/11/2026).
   */
  readonly donoFiltro = signal<string | null>(null);

  /**
   * A lista de planos; sem `status`, vêm todos. O backend não filtra e devolve
   * o documento inteiro, então filtro e resumo são feitos aqui. Em falha de
   * banco a rota responde `false`, que vira lista vazia.
   */
  listar(status?: StatusQuestionario): Observable<PlanoResumo[]> {
    return this.todos().pipe(
      map((planos) =>
        planos.filter((plano) => !status || plano.status_questionario === status).map(resumoDe),
      ),
    );
  }

  /** O documento de um incubado, em leitura. */
  plano(email: string): Observable<Questionario> {
    const ler = this.api
      .get<Questionario>(API_ROUTES.avaliacao.planoDe(email))
      .pipe(map(normalizar));
    return this.auth.me().pipe(
      switchMap((eu) => {
        if (eu.role !== 'avaliador') {
          return ler;
        }
        // O backend deixa o consultor ler qualquer plano por /usuarios/{email}/plano;
        // só o /questionario/todos filtra pela designação. Quem não foi designado não abre.
        return this.todos().pipe(
          switchMap((planos) =>
            planos.some((p) => p.usuario_email === email)
              ? ler
              : throwError(() => recusa('NAO_DESIGNADO')),
          ),
        );
      }),
    );
  }

  /** Grava a nota do avaliador numa etapa, assinada por quem está logado. */
  avaliar(email: string, entrada: NotaEntrada): Observable<Questionario> {
    return this.alterar(email, (plano, eu) => {
      // Quem decide não avalia: a coordenação passa no backend, mas não aqui.
      if (eu.role !== 'avaliador') {
        throw recusa('AVALIACAO_RESTRITA_CONSULTOR');
      }
      const aba = String(entrada.aba) as ChaveEtapa;
      const atual = plano.json_questionario[aba].avaliacao;
      // Uma nota por etapa: o primeiro avaliador fecha a etapa, e só ele regrava.
      if (atual && atual.avaliador !== eu.email) {
        throw recusa('ETAPA_JA_AVALIADA');
      }
      const json = comAba(plano.json_questionario, aba, {
        avaliacao: { avaliador: eu.email, nota: entrada.nota, comentario: entrada.comentario },
      });
      return { status_questionario: plano.status_questionario, json_questionario: json };
    });
  }

  /**
   * A coordenação devolve o plano em análise, com motivo, sem esperar nota:
   * as notas só existem depois da aprovação, quando os designados avaliam.
   */
  devolver(email: string, motivo: string): Observable<Questionario> {
    return this.alterar(email, (plano, eu) => {
      exigirAnalise(plano, eu);
      const justificativa = motivo.trim();
      if (!justificativa) {
        throw recusa('JUSTIFICATIVA_OBRIGATORIA');
      }
      return {
        status_questionario: 'rejeitado',
        json_questionario: comDecisao(
          plano.json_questionario,
          'rejeitado',
          eu.email,
          justificativa,
        ),
      };
    });
  }

  /** Quem pode ser designado: consultores. Rota só da coordenação . */
  avaliadores(): Observable<Avaliador[]> {
    return this.api.get<Avaliador[]>(API_ROUTES.designacao.avaliadores);
  }

  /**
   * A coordenação escolhe quem avalia — e só isso: o plano continua em
   * `aguardando_aprovacao` (decisão de 19/11/2026). Os designados dão nota e
   * podem pedir ajuste; depois a coordenação aprova (`aprovar`) ou devolve.
   */
  designar(email: string, avaliadores: string[]): Observable<unknown> {
    return forkJoin([this.todos(), this.auth.me()]).pipe(
      switchMap(([planos, eu]) => {
        const lido = planos.find((plano) => plano.usuario_email === email);
        if (!lido?.id) {
          return throwError(() => recusa('PLANO_NAO_ENCONTRADO'));
        }
        try {
          exigirAnalise(normalizar(lido), eu);
          if (!avaliadores.length) {
            throw recusa('AVALIADOR_OBRIGATORIO');
          }
        } catch (erro) {
          return throwError(() => erro);
        }
        return this.api.post<unknown>(API_ROUTES.designacao.selecionar, {
          questionario_id: lido.id,
          avaliadores,
        } satisfies DesignacaoEntrada);
      }),
    );
  }

  /** A coordenação aprova o plano em análise, com as nove etapas já avaliadas. */
  aprovar(email: string): Observable<Questionario> {
    return this.alterar(email, (plano, eu) => {
      exigirAnalise(plano, eu);
      const json = plano.json_questionario;
      if (NUMEROS_ETAPA.some((n) => !json[String(n) as ChaveEtapa].avaliacao)) {
        throw recusa('ETAPAS_PENDENTES');
      }
      return {
        status_questionario: 'aprovado',
        json_questionario: comDecisao(json, 'aprovado', eu.email, ''),
      };
    });
  }

  /**
   * A coordenação reabre um plano devolvido: ele volta a `pendente` e o incubado
   * pode corrigir e reenviar. A decisão fica no documento para o incubado ler o
   * motivo enquanto corrige; ela sai no reenvio (`QuestionarioService.enviar`).
   */
  reabrir(email: string): Observable<Questionario> {
    return this.alterar(email, (plano, eu) => {
      if (eu.role !== 'admin') {
        throw recusa('REABERTURA_RESTRITA_COORDENACAO');
      }
      if (plano.status_questionario !== 'rejeitado') {
        throw recusa('PLANO_NAO_DEVOLVIDO');
      }
      return { status_questionario: 'pendente', json_questionario: plano.json_questionario };
    });
  }

  /**
   * Pede ajuste numa etapa e devolve o plano ao incubado (`pendente`). Some
   * quando ele reenvia para análise (`QuestionarioService.enviar`).
   */
  pedirAjuste(email: string, entrada: AjusteEntrada): Observable<Questionario> {
    return this.alterar(email, (plano, eu) => {
      // A coordenação decide, não devolve etapa.
      if (eu.role !== 'avaliador') {
        throw recusa('AJUSTE_RESTRITO_AVALIADOR');
      }
      if (!ETAPAS_COM_AJUSTE.includes(entrada.aba)) {
        throw recusa('ETAPA_SEM_AJUSTE');
      }
      const mensagem = entrada.mensagem.trim();
      if (!mensagem) {
        throw recusa('MENSAGEM_OBRIGATORIA');
      }
      const jaDevolvido =
        plano.status_questionario === 'pendente' &&
        etapasComAjuste(plano.json_questionario).length > 0;
      if (plano.status_questionario !== 'aguardando_aprovacao' && !jaDevolvido) {
        throw recusa('PLANO_FORA_DE_ANALISE');
      }
      const aba = String(entrada.aba) as ChaveEtapa;
      const json = comAba(plano.json_questionario, aba, {
        ajuste: { mensagem, avaliador: eu.email, em: new Date().toISOString() },
      });
      return { status_questionario: 'pendente', json_questionario: json };
    });
  }

  /**
   * A coordenação corrige as respostas do incubado. Só os campos dele mudam:
   * nota, ajuste e anexos ficam como estão no servidor, e o status também —
   * corrigir não envia nem aprova.
   */
  corrigir(email: string, corrigido: JsonQuestionario): Observable<Questionario> {
    return this.alterar(email, (plano, eu) => {
      if (eu.role !== 'admin') {
        throw recusa('EDICAO_RESTRITA_COORDENACAO');
      }
      let json = plano.json_questionario;
      for (const numero of NUMEROS_ETAPA) {
        const aba = String(numero) as ChaveEtapa;
        const campos = { ...corrigido[aba] } as Record<string, unknown>;
        for (const doServidor of CAMPOS_FORA_DA_CORRECAO) {
          delete campos[doServidor];
        }
        json = comAba(json, aba, campos);
      }
      return { status_questionario: plano.status_questionario, json_questionario: json };
    });
  }

  /** Todos os planos como o servidor os tem, com o `id` que a escrita exige. */
  private todos(): Observable<Questionario[]> {
    return this.api
      .get<Questionario[] | false>(API_ROUTES.avaliacao.planos)
      .pipe(map((planos) => planos || []));
  }

  /**
   * Relê o plano (a versão do servidor, não a da tela), aplica a mudança e grava.
   * Ler pelo `/todos` é o único jeito de saber o `id`: o plano alheio não o traz.
   * A janela entre ler e gravar é curta, mas existe — o backend não tem trava.
   */
  private alterar(
    email: string,
    mudanca: (plano: Questionario, eu: SessionUser) => QuestionarioEntrada,
  ): Observable<Questionario> {
    return forkJoin([this.todos(), this.auth.me()]).pipe(
      switchMap(([planos, eu]) => {
        const lido = planos.find((plano) => plano.usuario_email === email);
        if (!lido?.id) {
          return throwError(() => recusa('PLANO_NAO_ENCONTRADO'));
        }
        const plano = normalizar(lido);
        let corpo: QuestionarioEntrada;
        try {
          corpo = mudanca(plano, eu);
        } catch (erro) {
          return throwError(() => erro);
        }
        // A resposta do PUT não traz `id` nem `usuario_email`: o lido completa.
        const gravar = this.api
          .put<Questionario>(API_ROUTES.avaliacao.porId(lido.id), corpo)
          .pipe(map((gravado) => normalizar({ ...lido, ...gravado })));
        return gravar;
      }),
    );
  }
}

/** Do servidor, não das respostas do incubado: a correção não os toca. */
const CAMPOS_FORA_DA_CORRECAO = ['avaliacao', 'ajuste', 'arquivos'];

/** O documento com campos trocados numa aba, sem mexer no original. */
function comAba(
  json: JsonQuestionario,
  aba: ChaveEtapa,
  campos: Record<string, unknown>,
): JsonQuestionario {
  return { ...json, [aba]: { ...json[aba], ...campos } };
}

/** O documento com a decisão da coordenação; a justificativa só vale ao devolver. */
function comDecisao(
  json: JsonQuestionario,
  status: 'aprovado' | 'rejeitado',
  por: string,
  justificativa: string,
): JsonQuestionario {
  return {
    ...json,
    decisao: {
      status,
      por,
      em: new Date().toISOString(),
      justificativa: status === 'rejeitado' ? justificativa : '',
    },
  };
}

/** Aprovar ou devolver na entrada: só a coordenação, e só com o plano em análise. */
function exigirAnalise(plano: Questionario, eu: SessionUser): void {
  if (eu.role !== 'admin') {
    throw recusa('DECISAO_RESTRITA_COORDENACAO');
  }
  if (plano.status_questionario !== 'aguardando_aprovacao') {
    throw recusa('PLANO_FORA_DE_DECISAO');
  }
}

/**
 * As regras do produto que o backend ainda não confere. Recusadas aqui, antes
 * de qualquer escrita, com o mesmo `ApiError` que uma recusa do servidor teria.
 */
const MENSAGENS_RECUSA: Record<string, string> = {
  PLANO_NAO_ENCONTRADO: 'Este plano não foi encontrado. Atualize a lista e tente de novo.',
  ETAPA_JA_AVALIADA: 'Esta etapa já foi avaliada por outro consultor.',
  AVALIACAO_RESTRITA_CONSULTOR: 'Quem avalia as etapas é o consultor, não a coordenação.',
  DECISAO_RESTRITA_COORDENACAO: 'Só a coordenação pode aprovar ou devolver um plano.',
  EDICAO_RESTRITA_COORDENACAO: 'Só a coordenação pode corrigir as respostas de um plano.',
  ETAPAS_PENDENTES: 'Os avaliadores ainda não deram nota nas nove etapas.',
  JUSTIFICATIVA_OBRIGATORIA: 'Escreva o motivo para devolver o plano.',
  AJUSTE_RESTRITO_AVALIADOR: 'Só o avaliador pode pedir ajuste numa etapa.',
  ETAPA_SEM_AJUSTE: 'A etapa 1 não recebe pedido de ajuste.',
  MENSAGEM_OBRIGATORIA: 'Escreva o que o incubado precisa corrigir.',
  PLANO_FORA_DE_ANALISE: 'Só dá para pedir ajuste em plano enviado para análise.',
  PLANO_FORA_DE_DECISAO: 'Só dá para aprovar ou devolver um plano enviado para análise.',
  REABERTURA_RESTRITA_COORDENACAO: 'Só a coordenação pode reabrir um plano devolvido.',
  PLANO_NAO_DEVOLVIDO: 'Só um plano devolvido para ajustes pode ser reaberto.',
  AVALIADOR_OBRIGATORIO: 'Escolha ao menos um avaliador para o plano.',
  NAO_DESIGNADO: 'Você não foi designado para avaliar este plano.',
};

function recusa(code: string): ApiError {
  return { code, message: MENSAGENS_RECUSA[code] };
}

/** Uma linha da lista: quem é o plano sai da etapa 1, que pode não existir ainda. */
function resumoDe(plano: Questionario): PlanoResumo {
  const etapa1 = plano.json_questionario?.['1'];
  return {
    usuario_email: plano.usuario_email ?? '',
    status_questionario: plano.status_questionario,
    criado_em: plano.criado_em ?? null,
    atualizado_em: plano.atualizado_em ?? null,
    nome_proponente: etapa1?.nome_proponente ?? '',
    nome_negocio: etapa1?.nome_negocio ?? '',
  };
}
