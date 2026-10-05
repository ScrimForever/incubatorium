import { NumeroEtapa, StatusQuestionario } from './questionario';

/**
 * Uma linha da lista de planos de negócio — o que a tela do avaliador precisa
 * para escolher qual abrir, sem carregar o documento inteiro de cada um.
 *
 * Contrato pedido em `docs/contrato-avaliacao.md` (`GET /questionarios`);
 * enquanto a rota não existe, quem responde é o mock de desenvolvimento.
 */
export interface PlanoResumo {
  usuario_email: string;
  status_questionario: StatusQuestionario;
  criado_em?: string | null;
  atualizado_em?: string | null;
  /**
   * Nome do proponente e do negócio, tirados de `json_questionario["1"]`
   * (`nome_proponente` / `nome_negocio`) para a lista mostrar quem é o plano sem
   * abrir o documento. Opcionais: `GET /questionarios` **ainda não os devolve**
   * (só o mock preenche — divergência em `docs/contrato-avaliacao.md`); enquanto
   * não vierem, a tela cai no e-mail.
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

/** O que o avaliador envia ao avaliar uma etapa. Sem status: avaliar não aprova. */
export interface NotaEntrada {
  aba: NumeroEtapa;
  valor: 1 | 2 | 3 | 4 | 5 | null;
  texto: string;
  especialidade: string;
}
