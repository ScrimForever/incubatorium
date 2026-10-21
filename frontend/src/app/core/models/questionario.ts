/**
 * Questionário Plano de Negócios — nove etapas num JSON só. O backend guarda
 * `status_questionario` (enum) e `json_questionario` (JSONB livre); o formato
 * do documento é definido aqui: um mapa por aba, de `"1"` a `"9"`, cada uma com
 * seus campos, a ficha dos anexos e a avaliação que recebeu:
 *
 * ```json
 * {
 *   "1": { "nome_proponente": "", "...": "", "avaliacao": null, "ajuste": null },
 *   "2": {
 *     "business_canvas": "",
 *     "avaliacao": { "avaliador": "ana@x", "nota": 4, "comentario": "" },
 *     "ajuste": { "mensagem": "...", "avaliador": "ana@x", "em": "2026-10-18T14:00:00Z" }
 *   }
 * }
 * ```
 */

export type NumeroEtapa = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/**
 * A etapa como chave do documento. Separado de `keyof JsonQuestionario` porque
 * o documento tem uma chave que não é etapa (`decisao`), e indexar por `keyof`
 * quebraria todo `json[chave].avaliacao`.
 */
export type ChaveEtapa = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

export const NUMEROS_ETAPA: readonly NumeroEtapa[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Ficha de um anexo, não o conteúdo: este vai por `POST /arquivos/...` e fica
 * no disco do backend. A API não devolve id nem URL, então o vínculo com o
 * arquivo gravado é (dono do token, aba) mais o nome.
 */
export interface Anexo {
  nome: string;
  tipo: string;
  tamanho: number;
}

/** Teto por arquivo, conferido antes do envio: a tela não tem barra de progresso. */
export const TAMANHO_MAXIMO_ANEXO = 10 * 1024 * 1024;

/** Nove fecha três linhas de três cartões — e segura o tamanho do documento. */
export const MAXIMO_ANEXOS_POR_ETAPA = 9;

/**
 * As extensões que o backend aceita no envio. Vão no `accept` do seletor, mas
 * `accept` não é trava: quem recusa é o servidor (`422`).
 */
export const EXTENSOES_ANEXO = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.docx',
  '.xlsx',
  '.pptx',
  '.doc',
  '.xls',
  '.ppt',
  '.txt',
  '.csv',
] as const;

/**
 * A avaliação de um avaliador numa etapa. Avaliar não aprova: nada aqui toca
 * `status_questionario`.
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
 * Classe de cor da nota, do vermelho (1) ao verde (5). Fica aqui porque a mesma
 * escala pinta a votação e o selo de leitura; a classe só carrega as variáveis
 * de cor (`styles.scss`), e o rótulo vem sempre escrito ao lado.
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
 * Toda aba carrega uma só avaliação (quem avalia primeiro fecha a etapa) e um só
 * pedido de ajuste. Os dois são gravados por quem avalia (`PUT /questionario/{id}`);
 * o `PUT` do incubado os devolve como vieram, e só o envio para análise limpa o ajuste.
 */
interface EtapaBase {
  avaliacao: Avaliacao | null;
  ajuste: AjusteEtapa | null;
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
   * A decisão da coordenação, quando já houve uma. O `status_questionario`
   * segue sendo a verdade sobre a situação; isto guarda quem decidiu, quando e
   * por quê.
   */
  decisao?: DecisaoPlano;
}

/**
 * O que falta corrigir numa etapa, quem pediu e quando. Some quando o incubado
 * reenvia o plano para análise.
 */
export interface AjusteEtapa {
  mensagem: string;
  /** E-mail de quem pediu — vem do token, no servidor. */
  avaliador: string;
  /** ISO 8601 em UTC, gravado pelo servidor. */
  em: string;
}

/** A etapa 1 só identifica o negócio: não recebe pedido de ajuste. */
export const ETAPAS_COM_AJUSTE: readonly NumeroEtapa[] = [2, 3, 4, 5, 6, 7, 8, 9];

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
 * A resposta da API. Cada rota devolve um subconjunto dos campos (o plano alheio
 * não traz `id` nem `criado_por`; `POST` e `PUT` só trazem `criado_*`), por isso
 * os opcionais. `decidido_*` e `motivo_decisao` ainda vêm sempre `null`.
 */
export interface Questionario {
  status_questionario: StatusQuestionario;
  json_questionario: JsonQuestionario;
  id?: number;
  criado_por?: string | null;
  criado_em?: string | null;
  usuario_email?: string;
  atualizado_em?: string | null;
  atualizado_por?: string | null;
  decidido_por?: string | null;
  decidido_em?: string | null;
  motivo_decisao?: string | null;
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
      ajuste: null,
    },
    '2': { business_canvas: '', avaliacao: null, ajuste: null },
    '3': { sumario_executivo: '', avaliacao: null, ajuste: null },
    '4': { equipe: [], avaliacao: null, ajuste: null },
    '5': { planejamento_produto: '', avaliacao: null, ajuste: null },
    '6': {
      fornecedores: '',
      concorrentes: '',
      analise_acao: '',
      arquivos: [],
      avaliacao: null,
      ajuste: null,
    },
    '7': { planejamento_marketing: '', avaliacao: null, ajuste: null },
    '8': { planejamento_estrutura: '', avaliacao: null, ajuste: null },
    '9': { observacoes: '', arquivos: [], avaliacao: null, ajuste: null },
  };
}
