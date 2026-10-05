import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { APP_ROUTES, entradaDe } from '../constants/app-constants';
import { Role } from '../models/auth';
import { StatusQuestionario } from '../models/questionario';
import { Auth } from '../services/auth';
import { QuestionarioService } from '../services/questionario';

/**
 * A regra única do onboarding: o `status_questionario` decide onde o incubado
 * pode estar, e cada status tem uma rota própria.
 *
 * ```
 * iniciado             → /questionario            (vazio)
 * pendente             → /questionario            (preenchido, de onde parou)
 * aguardando_aprovacao → /aguardando-aprovacao
 * rejeitado            → /plano-rejeitado
 * aprovado             → a entrada do papel        (o painel, para o incubado)
 * ```
 *
 * Todo guard daqui deriva desta função — duas versões da mesma regra
 * divergiriam.
 */
export function destinoPara(status: StatusQuestionario, role: Role): string {
  switch (status) {
    case 'iniciado':
    case 'pendente':
      return APP_ROUTES.questionario;
    case 'aguardando_aprovacao':
      return APP_ROUTES.aguardandoAprovacao;
    case 'rejeitado':
      return APP_ROUTES.planoRejeitado;
    case 'aprovado':
      return entradaDe(role);
  }
}

/** O que fazer com quem não é incubado — o questionário não é dele. */
type ForaDoFluxo = 'passa' | 'painel';

/**
 * Monta um guard que só deixa entrar nos status listados; qualquer outro é
 * mandado para o lugar que lhe cabe, segundo `destinoPara`.
 *
 * Erro na consulta manda o incubado para o questionário, o degrau mais baixo
 * do fluxo, onde o erro aparece. Liberar a tela em caso de falha abriria o
 * painel, que só o plano aprovado abre.
 */
function somenteCom(permitidos: readonly StatusQuestionario[], fora: ForaDoFluxo): CanActivateFn {
  return (): Observable<boolean | UrlTree> => {
    const auth = inject(Auth);
    const service = inject(QuestionarioService);
    const router = inject(Router);

    return auth.me().pipe(
      switchMap((user) => {
        if (user.role !== 'incubado') {
          return of<boolean | UrlTree>(
            fora === 'passa' ? true : router.parseUrl(entradaDe(user.role)),
          );
        }
        return service.meu().pipe(
          map<{ status_questionario: StatusQuestionario }, boolean | UrlTree>((plano) =>
            permitidos.includes(plano.status_questionario)
              ? true
              : router.parseUrl(destinoPara(plano.status_questionario, user.role)),
          ),
          catchError(() => of<boolean | UrlTree>(router.parseUrl(APP_ROUTES.questionario))),
        );
      }),
      catchError(() => of<boolean | UrlTree>(true)),
    );
  };
}

/** O formulário: só de quem ainda está preenchendo. */
export const questionarioGuard = somenteCom(['iniciado', 'pendente'], 'painel');

/** A tela de espera: só de quem enviou e ainda não teve resposta. */
export const aguardandoAprovacaoGuard = somenteCom(['aguardando_aprovacao'], 'painel');

/** A tela de devolução: só de quem teve o plano rejeitado. */
export const planoRejeitadoGuard = somenteCom(['rejeitado'], 'painel');

/**
 * O painel e tudo que vive dentro dele (visão geral, Meu plano, Minha conta).
 * Para o incubado é a recompensa do plano aprovado; quem não é incubado passa
 * direto, porque não tem questionário nenhum.
 */
export const planoAprovadoGuard = somenteCom(['aprovado'], 'passa');
