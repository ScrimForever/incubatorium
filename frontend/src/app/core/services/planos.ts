import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_ROUTES } from '../constants/api-routes';
import { Api } from '../http/api';
import { DecisaoEntrada, NotaEntrada, PlanoResumo } from '../models/plano';
import { Questionario, StatusQuestionario } from '../models/questionario';
import { normalizar } from './questionario';

/**
 * Planos de negócio vistos por quem avalia.
 *
 * Separado do `QuestionarioService` de propósito: aquele cuida do **meu** plano
 * (guarda em cache, cria no primeiro acesso, grava o documento inteiro), e este
 * lê o plano **de outra pessoa** e grava só nota. Misturar os dois faria o cache
 * de um vazar no outro.
 *
 * Avaliar não aprova: `avaliar()` não manda status, e quem muda a situação do
 * plano é `decidir()` — rota separada, restrita à coordenação no servidor. São
 * duas ações diferentes porque são dois papéis diferentes.
 */
@Injectable({ providedIn: 'root' })
export class PlanosService {
  private readonly api = inject(Api);

  /** A lista para escolher qual plano abrir; sem `status`, vêm todos. */
  listar(status?: StatusQuestionario): Observable<PlanoResumo[]> {
    const url = status
      ? `${API_ROUTES.avaliacao.planos}?status=${status}`
      : API_ROUTES.avaliacao.planos;
    return this.api.get<PlanoResumo[]>(url);
  }

  /** O documento de um incubado, em leitura. */
  plano(email: string): Observable<Questionario> {
    return this.api.get<Questionario>(API_ROUTES.avaliacao.planoDe(email)).pipe(map(normalizar));
  }

  /**
   * Grava a nota do avaliador numa etapa e devolve o documento atualizado.
   *
   * `avaliador` e `em` não vão no corpo: quem assina a nota é o token, decidido
   * no servidor. Se fossem daqui, qualquer um assinaria em nome de outro.
   */
  avaliar(email: string, nota: NotaEntrada): Observable<Questionario> {
    return this.api
      .patch<Questionario>(API_ROUTES.avaliacao.notaDe(email), nota)
      .pipe(map(normalizar));
  }

  /**
   * Aprova ou devolve o plano — **só a coordenação** (`is_admin`), e a trava que
   * vale é a do servidor: a interface apenas não oferece o botão aos outros.
   *
   * Rota própria, separada da nota, para que nenhuma gravação de avaliador
   * possa carregar um status junto.
   */
  decidir(email: string, decisao: DecisaoEntrada): Observable<Questionario> {
    return this.api
      .patch<Questionario>(API_ROUTES.avaliacao.statusDe(email), decisao)
      .pipe(map(normalizar));
  }
}
