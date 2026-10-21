import { NumeroEtapa, StatusQuestionario } from './questionario';

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
 * A decisão da coordenação, como a tela a pede. `por` e `em` o `PlanosService`
 * preenche com a sessão e o relógio: o backend só guarda o documento.
 */
export interface DecisaoEntrada {
  status: 'aprovado' | 'rejeitado';
  /** Obrigatória ao devolver, ignorada ao aprovar. */
  justificativa: string;
}

/**
 * A nota de uma etapa, como a tela a pede. Sem status: avaliar não aprova. Quem
 * assina (`avaliador`) sai da sessão, no `PlanosService`, nunca da tela.
 */
export interface NotaEntrada {
  aba: NumeroEtapa;
  nota: 1 | 2 | 3 | 4 | 5 | null;
  comentario: string;
}

/**
 * O pedido de ajuste numa etapa. Sem status: quem leva o plano para `pendente` é
 * o `PlanosService`, que também assina `avaliador` e `em`.
 */
export interface AjusteEntrada {
  aba: NumeroEtapa;
  mensagem: string;
}
