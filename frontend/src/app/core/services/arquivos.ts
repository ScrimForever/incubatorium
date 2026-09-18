import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_ROUTES } from '../constants/api-routes';
import { Api } from '../http/api';
import { RespostaEnvioArquivos } from '../models/arquivo';
import { Anexo, NumeroEtapa } from '../models/questionario';

/**
 * Anexos do questionário. O backend só sabe receber — não lista, não devolve e
 * não apaga arquivo (limitações em `docs/contrato-arquivos.md`), então a lista
 * da tela vive no `json_questionario`.
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
}
