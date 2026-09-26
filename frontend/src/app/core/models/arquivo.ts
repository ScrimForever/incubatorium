/** Resposta de `POST /arquivos/questionario/{aba}` — espelha a API, `content_type` inclusive. */
export interface ArquivoRecebido {
  nome: string;
  content_type: string;
  tamanho: number;
}

export interface RespostaEnvioArquivos {
  arquivos_recebidos: ArquivoRecebido[];
}
