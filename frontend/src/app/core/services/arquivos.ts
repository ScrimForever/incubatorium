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
 * Sem `dono`, tudo é do usuário logado — o backend monta o caminho a partir do
 * e-mail do token. Listar e baixar aceitam `dono` para ler a pasta de outra
 * pessoa (o modo avaliação); enviar e apagar, não: anexo alheio é só leitura
 * (`docs/contrato-arquivos.md`).
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
  listar(aba: NumeroEtapa, dono?: string): Observable<string[]> {
    return this.api
      .get<string[]>(API_ROUTES.arquivos.nomes(aba, dono))
      .pipe(catchError(() => of([])));
  }

  /** O conteúdo de um anexo. A rota é `POST` porque exige corpo JSON. */
  baixar(aba: NumeroEtapa, nome: string, dono?: string): Observable<Blob> {
    return this.api.postBlob(API_ROUTES.arquivos.download(aba, dono), { nome_arquivo: nome }).pipe(
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
   * Apaga do disco os nomes pedidos. Nome que já não existe volta em `erros`
   * com `200`, e para a tela isso é o mesmo que apagado.
   */
  apagar(aba: NumeroEtapa, nomes: readonly string[]): Observable<RespostaRemocaoArquivos> {
    return this.api.deleteComCorpo<RespostaRemocaoArquivos>(API_ROUTES.arquivos.questionario(aba), [
      ...nomes,
    ]);
  }
}
