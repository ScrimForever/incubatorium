/**
 * Questionário Plano de Negócios — nove etapas dentro de um JSON só.
 *
 * O backend guarda o plano em duas colunas: `status_questionario` (enum) e
 * `json_questionario` (JSONB livre). Nenhum campo do formulário existe lá; o
 * formato é definido aqui.
 *
 * O documento é um mapa por aba, de `"1"` a `"9"`, e cada aba carrega os seus
 * campos, a ficha dos seus anexos e **a** avaliação que recebeu — uma por etapa:
 *
 * ```json
 * {
 *   "1": { "nome_proponente": "", "...": "", "avaliacao": null },
 *   "2": {
 *     "business_canvas": "",
 *     "avaliacao": { "avaliador": "ana@x", "nota": 4, "comentario": "" }
 *   }
 * }
 * ```
 *
 * O formato da chave `avaliacao` é o que o Scrim definiu no Trello (28/09/2026),
 * para as rotas que ele ainda vai publicar: três campos, e só.
 *
 * Os nomes de campo espelham o sistema em React que veio antes.
 */

/** As nove etapas são identificadas pelo número, como no sistema anterior. */
export type NumeroEtapa = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/**
 * A mesma coisa como chave do documento. Existe separado de
 * `keyof JsonQuestionario` porque o documento tem uma chave que **não** é etapa
 * (`decisao`): indexar por `keyof` traria essa chave junto e quebraria todo
 * `json[chave].notas`.
 */
export type ChaveEtapa = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

export const NUMEROS_ETAPA: readonly NumeroEtapa[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Arquivo anexado a uma etapa — só o registro, não o conteúdo: este vai por
 * `POST /arquivos/questionario/{aba}` e fica no disco do backend. A API não
 * devolve id nem URL, então o vínculo com o arquivo gravado é (dono do token,
 * aba) mais o nome.
 */
export interface Anexo {
  nome: string;
  tipo: string;
  tamanho: number;
}

/**
 * Teto por arquivo. O backend não impõe nenhum — este existe para o upload não
 * virar espera sem fim, já que a tela não tem barra de progresso.
 */
export const TAMANHO_MAXIMO_ANEXO = 10 * 1024 * 1024;

/** Nove fecha três linhas de três cartões — e segura o tamanho do documento. */
export const MAXIMO_ANEXOS_POR_ETAPA = 9;

/**
 * A avaliação de **um** avaliador numa etapa.
 *
 * Vários avaliadores avaliam o mesmo plano, cada um pela sua especialidade, e o
 * e-mail é a chave: gravar de novo troca a própria nota e nunca a de outro.
 * `valor` aceita `null` para quem quer só comentar sem pontuar.
 *
 * Avaliar não aprova: nada aqui toca `status_questionario` — a regra está no
 * formato, não só na tela (`docs/contrato-avaliacao.md`).
 */
export interface Avaliacao {
  /** E-mail de quem avaliou — vem do token, nunca da tela. */
  avaliador: string;
  /** `null` para quem quer só comentar sem pontuar. */
  nota: 1 | 2 | 3 | 4 | 5 | null;
  comentario: string;
}

export const ROTULO_NOTA: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Ruim',
  2: 'Razoável',
  3: 'Bom',
  4: 'Muito Bom',
  5: 'Excelente',
};

/**
 * Classe de cor da nota: a escala vai do vermelho (1) ao verde (5).
 *
 * Fica aqui, e não no template, porque a mesma escala pinta a votação do
 * avaliador e o selo da leitura. A classe só carrega as variáveis de cor
 * (`styles.scss`); quem pinta é a regra de cada componente. A cor é reforço —
 * o conceito ("Ruim"…"Excelente") vem escrito ao lado em toda tela.
 */
export const CLASSE_NOTA: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'nota-1',
  2: 'nota-2',
  3: 'nota-3',
  4: 'nota-4',
  5: 'nota-5',
};

/** Um integrante da equipe (etapa 4). */
export interface MembroEquipe {
  id: string;
  nome: string;
  formacao_academica: string;
  experiencia: string;
  email: string;
  telefone: string;
}

/**
 * Toda aba carrega a avaliação que recebeu — **uma só**: quem avalia primeiro
 * fecha a etapa, e só o autor reabre a dele.
 */
interface EtapaBase {
  avaliacao: Avaliacao | null;
}

interface Etapa1 extends EtapaBase {
  nome_proponente: string;
  nome_negocio: string;
  setor_atuacao: string;
  cnpj: string;
}

interface Etapa2 extends EtapaBase {
  business_canvas: string;
}

interface Etapa3 extends EtapaBase {
  sumario_executivo: string;
}

interface Etapa4 extends EtapaBase {
  equipe: MembroEquipe[];
}

interface Etapa5 extends EtapaBase {
  planejamento_produto: string;
}

interface Etapa6 extends EtapaBase {
  fornecedores: string;
  concorrentes: string;
  analise_acao: string;
  arquivos: Anexo[];
}

interface Etapa7 extends EtapaBase {
  planejamento_marketing: string;
}

interface Etapa8 extends EtapaBase {
  planejamento_estrutura: string;
}

interface Etapa9 extends EtapaBase {
  observacoes: string;
  arquivos: Anexo[];
}

/** O documento inteiro — o que vai e volta em `json_questionario`. */
export interface JsonQuestionario {
  '1': Etapa1;
  '2': Etapa2;
  '3': Etapa3;
  '4': Etapa4;
  '5': Etapa5;
  '6': Etapa6;
  '7': Etapa7;
  '8': Etapa8;
  '9': Etapa9;
  /**
   * A decisão da coordenação sobre o plano, quando já houve uma.
   *
   * Mora no documento, e não numa coluna nova, pelo mesmo motivo das notas: o
   * `json_questionario` é JSONB livre e é do frontend. O `status_questionario`
   * continua sendo a verdade sobre a situação — isto guarda **quem decidiu,
   * quando e por quê**, que o enum sozinho não conta.
   */
  decisao?: DecisaoPlano;
}

/** Quem aprovou ou devolveu o plano, quando, e o motivo da devolução. */
export interface DecisaoPlano {
  status: 'aprovado' | 'rejeitado';
  /** E-mail de quem decidiu — vem do token, no servidor. */
  por: string;
  /** ISO 8601 em UTC, gravado pelo servidor. */
  em: string;
  /** Obrigatória ao devolver; vazia ao aprovar. */
  justificativa: string;
}

/**
 * Situação do plano. O enum é do backend, em PT, e decide a tela do incubado
 * logo depois do login:
 *
 * - `iniciado` → questionário vazio
 * - `pendente` → questionário preenchido, retomando de onde parou
 * - `aguardando_aprovacao` → plano em leitura, aguardando análise
 * - `aprovado` → dashboard liberado
 * - `rejeitado` → plano devolvido, com as notas do avaliador
 */
export type StatusQuestionario =
  'iniciado' | 'pendente' | 'aguardando_aprovacao' | 'aprovado' | 'rejeitado';

export const ROTULO_STATUS: Record<StatusQuestionario, string> = {
  iniciado: 'Não iniciado',
  pendente: 'Em preenchimento',
  aguardando_aprovacao: 'Aguardando análise',
  aprovado: 'Aprovado',
  rejeitado: 'Devolvido para ajustes',
};

/** Os dois status em que o formulário ainda está aberto para edição. */
export const STATUS_EM_PREENCHIMENTO: readonly StatusQuestionario[] = ['iniciado', 'pendente'];

/**
 * A resposta da API. `GET` devolve também `usuario_email`, `atualizado_em` e
 * `atualizado_por`; `POST` e `PUT` passam por `QuestionarioOutputSchema` e só
 * trazem `criado_por` e `criado_em` — por isso os opcionais.
 */
export interface Questionario {
  status_questionario: StatusQuestionario;
  json_questionario: JsonQuestionario;
  criado_por?: string | null;
  criado_em?: string | null;
  usuario_email?: string;
  atualizado_em?: string | null;
  atualizado_por?: string | null;
}

/** O corpo de `POST` e `PUT` — é sempre o documento inteiro. */
export interface QuestionarioEntrada {
  status_questionario: StatusQuestionario;
  json_questionario: JsonQuestionario;
}

/** O documento em branco — é o que o `POST` grava no primeiro acesso. */
export function documentoVazio(): JsonQuestionario {
  return {
    '1': {
      nome_proponente: '',
      nome_negocio: '',
      setor_atuacao: '',
      cnpj: '',
      avaliacao: null,
    },
    '2': { business_canvas: '', avaliacao: null },
    '3': { sumario_executivo: '', avaliacao: null },
    '4': { equipe: [], avaliacao: null },
    '5': { planejamento_produto: '', avaliacao: null },
    '6': {
      fornecedores: '',
      concorrentes: '',
      analise_acao: '',
      arquivos: [],
      avaliacao: null,
    },
    '7': { planejamento_marketing: '', avaliacao: null },
    '8': { planejamento_estrutura: '', avaliacao: null },
    '9': { observacoes: '', arquivos: [], avaliacao: null },
  };
}
