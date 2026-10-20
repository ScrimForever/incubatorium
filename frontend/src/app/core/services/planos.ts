import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_ROUTES } from '../constants/api-routes';
import { Api } from '../http/api';
import {
  AjusteEntrada,
  DecisaoEntrada,
  NotaEntrada,
  PlanoCorrecaoEntrada,
  PlanoResumo,
} from '../models/plano';
import { JsonQuestionario, Questionario, StatusQuestionario } from '../models/questionario';
import { normalizar } from './questionario';

/**
 * Planos de negócio vistos por quem avalia. Separado do `QuestionarioService`
 * (o meu plano, com cache) para o cache de um não vazar no outro. Avaliar não
 * aprova: `avaliar()` não manda status; quem muda a situação é `decidir()`.
 */
@Injectable({ providedIn: 'root' })
export class PlanosService {
  private readonly api = inject(Api);

  /**
   * A lista de planos; sem `status`, vêm todos. O backend não filtra e devolve
   * o documento inteiro, então filtro e resumo são feitos aqui. Em falha de
   * banco a rota responde `false`, que vira lista vazia.
   */
  listar(status?: StatusQuestionario): Observable<PlanoResumo[]> {
    return this.api
      .get<Questionario[] | false>(API_ROUTES.avaliacao.planos)
      .pipe(
        map((planos) =>
          (planos || [])
            .filter((plano) => !status || plano.status_questionario === status)
            .map(resumoDe),
        ),
      );
  }

  /** O documento de um incubado, em leitura. */
  plano(email: string): Observable<Questionario> {
    return this.api.get<Questionario>(API_ROUTES.avaliacao.planoDe(email)).pipe(map(normalizar));
  }

  /**
   * Grava a nota do avaliador numa etapa e devolve o documento atualizado.
   * `avaliador` não vai no corpo: quem assina é o token, no servidor.
   */
  avaliar(email: string, nota: NotaEntrada): Observable<Questionario> {
    return this.api
      .patch<Questionario>(API_ROUTES.avaliacao.notaDe(email), nota)
      .pipe(map(normalizar));
  }

  /**
   * Aprova ou devolve o plano — só a coordenação, e a trava que vale é a do
   * servidor. Rota separada da nota para que nenhuma gravação de avaliador
   * carregue um status junto.
   */
  decidir(email: string, decisao: DecisaoEntrada): Observable<Questionario> {
    return this.api
      .patch<Questionario>(API_ROUTES.avaliacao.statusDe(email), decisao)
      .pipe(map(normalizar));
  }

  /**
   * Pede ajuste numa etapa. O servidor grava quem pediu e quando, e devolve o
   * plano já em `pendente` (`docs/contrato-avaliacao.md`, Parte 5).
   */
  pedirAjuste(email: string, ajuste: AjusteEntrada): Observable<Questionario> {
    return this.api
      .patch<Questionario>(API_ROUTES.avaliacao.ajusteDe(email), ajuste)
      .pipe(map(normalizar));
  }

  /**
   * A coordenação corrige as respostas do incubado. Vai só o documento, sem
   * status: corrigir não envia nem aprova. Notas, decisão e anexos o servidor
   * mantém como estão (`docs/contrato-avaliacao.md`, Parte 4).
   */
  corrigir(email: string, json: JsonQuestionario): Observable<Questionario> {
    const corpo: PlanoCorrecaoEntrada = { json_questionario: json };
    return this.api
      .put<Questionario>(API_ROUTES.avaliacao.planoDe(email), corpo)
      .pipe(map(normalizar));
  }
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
