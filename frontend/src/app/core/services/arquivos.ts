import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { API_ROUTES } from '../constants/api-routes';
import { Api } from '../http/api';
import { RespostaEnvioArquivos } from '../models/arquivo';
import { Anexo, NumeroEtapa } from '../models/questionario';

/**
 * Anexos do questionário: enviar e listar. Baixar e apagar não existem de forma
 * consumível — limitações medidas em `docs/contrato-arquivos.md`.
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
   * Falha nunca sobe: aba que nunca recebeu arquivo responde `500` (a pasta não
   * existe e o `iterdir()` estoura), e para a tela isso é "nenhum arquivo". O
   * `401` também morre aqui sem prejuízo, porque derrubar a sessão é efeito do
   * error-interceptor, que já aconteceu antes desta linha.
   */
  listar(aba: NumeroEtapa): Observable<string[]> {
    return this.api.get<string[]>(API_ROUTES.arquivos.nomes(aba)).pipe(catchError(() => of([])));
  }
}
