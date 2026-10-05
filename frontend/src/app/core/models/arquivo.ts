/** Resposta de `POST /arquivos/questionario/{aba}` — espelha a API, `content_type` inclusive. */
export interface ArquivoRecebido {
  nome: string;
  content_type: string;
  tamanho: number;
}

export interface RespostaEnvioArquivos {
  arquivos_recebidos: ArquivoRecebido[];
}

/** Um nome que o `DELETE` não conseguiu apagar, com o motivo que o backend deu. */
export interface ErroDeRemocao {
  arquivo: string;
  erro: string;
}

/**
 * Resposta de `DELETE /arquivos/questionario/{aba}`. Responde `200` mesmo
 * quando nada foi apagado: o que falhou vem em `erros`, e `null` quando deu
 * tudo certo.
 */
export interface RespostaRemocaoArquivos {
  arquivos_deletados: string[];
  erros: ErroDeRemocao[] | null;
}
