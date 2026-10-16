import { JsonQuestionario, NumeroEtapa, StatusQuestionario } from './questionario';

/**
 * Uma linha da lista de planos de negócio. Derivada no `PlanosService`, não
 * espelho da API: `GET /questionario/todos` devolve o documento inteiro.
 */
export interface PlanoResumo {
  usuario_email: string;
  status_questionario: StatusQuestionario;
  criado_em?: string | null;
  atualizado_em?: string | null;
  /**
   * Nome do proponente e do negócio, tirados de `json_questionario["1"]`. Vazios
   * enquanto o incubado não preencheu a etapa 1 — a tela diz "Negócio sem nome".
   */
  nome_proponente?: string;
  nome_negocio?: string;
}

/**
 * O que a coordenação envia ao decidir. `por` e `em` não vão no corpo: quem
 * decidiu é o token, no servidor.
 */
export interface DecisaoEntrada {
  status: 'aprovado' | 'rejeitado';
  /** Obrigatória ao devolver, ignorada ao aprovar. */
  justificativa: string;
}

/**
 * O que o avaliador envia ao avaliar uma etapa. Sem status: avaliar não aprova.
 * `avaliador` não vai no corpo — quem assina é o token, no servidor.
 */
export interface NotaEntrada {
  aba: NumeroEtapa;
  nota: 1 | 2 | 3 | 4 | 5 | null;
  comentario: string;
}

/**
 * O que a coordenação envia ao corrigir as respostas de um incubado. Só o
 * documento: sem status, porque corrigir não envia nem aprova. Notas, decisão e
 * anexos que vierem junto são ignorados pelo servidor.
 */
export interface PlanoCorrecaoEntrada {
  json_questionario: JsonQuestionario;
}
