import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { API_ROUTES } from '../constants/api-routes';
import { Api } from '../http/api';
import { RespostaEnvioArquivos, RespostaRemocaoArquivos } from '../models/arquivo';
import { ApiError } from '../models/auth';
import { Anexo, NumeroEtapa } from '../models/questionario';

/**
 * Anexos do questionário: enviar, listar, baixar e apagar.
 *
 * Tudo é escopado pelo token — o backend monta o caminho a partir do e-mail de
 * quem chama. Não existe rota para ler anexo de outra pessoa, então no modo
 * avaliação nada aqui serve (`docs/contrato-arquivos.md`).
 */
@Injectable({ providedIn: 'root' })
export class ArquivosService {
  private readonly api = inject(Api);

  enviar(aba: NumeroEtapa, arquivos: readonly File[]): Observable<Anexo[]> {
    const dados = new FormData();
    for (const arquivo of arquivos) {
      // Campo repetido, um por arquivo: é assim que o FastAPI monta a `list[UploadFile]`.
      dados.append('arquivos', arquivo, arquivo.name);
    }

    return this.api
      .postMultipart<RespostaEnvioArquivos>(API_ROUTES.arquivos.questionario(aba), dados)
      .pipe(
        map((resposta) =>
          resposta.arquivos_recebidos.map((recebido) => ({
            nome: recebido.nome,
            tipo: recebido.content_type,
            tamanho: recebido.tamanho,
          })),
        ),
      );
  }

  /**
   * Os nomes que existem no disco do backend para uma aba — é só isso que a
   * rota devolve, sem tamanho nem tipo.
   *
   * Falha nunca sobe: para a tela, aba ilegível é "nenhum arquivo". O `401`
   * também morre aqui sem prejuízo, porque derrubar a sessão é efeito do
   * error-interceptor, que já aconteceu antes desta linha.
   */
  listar(aba: NumeroEtapa): Observable<string[]> {
    return this.api.get<string[]>(API_ROUTES.arquivos.nomes(aba)).pipe(catchError(() => of([])));
  }

  /**
   * O conteúdo de um anexo. A rota é `POST` porque exige corpo JSON — o `GET`
   * anterior era inalcançável pelo navegador. Arquivo fora do disco vem `404`.
   */
  baixar(aba: NumeroEtapa, nome: string): Observable<Blob> {
    return this.api.postBlob(API_ROUTES.arquivos.download(aba), { nome_arquivo: nome }).pipe(
      catchError((erro: ApiError) =>
        // Aqui `404` não é rota inexistente, é arquivo que saiu do disco — o
        // recado genérico do interceptor não diria nada a quem está na tela.
        throwError(() =>
          erro.code === 'NOT_FOUND'
            ? { code: erro.code, message: 'Este arquivo não está mais no servidor.' }
            : erro,
        ),
      ),
    );
  }

  /**
   * Apaga do disco os nomes pedidos. O backend responde `200` mesmo para nome
   * que não existe mais — só o lista em `erros` —, e para a tela isso é o mesmo
   * que apagado: o que importa é que depois disto ele não está lá.
   */
  apagar(aba: NumeroEtapa, nomes: readonly string[]): Observable<RespostaRemocaoArquivos> {
    return this.api.deleteComCorpo<RespostaRemocaoArquivos>(API_ROUTES.arquivos.questionario(aba), [
      ...nomes,
    ]);
  }
}
