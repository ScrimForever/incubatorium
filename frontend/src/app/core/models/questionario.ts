/**
 * Questionário Plano de Negócios — nove etapas dentro de um JSON só.
 *
 * O backend guarda o plano em duas colunas: `status_questionario` (enum) e
 * `json_questionario` (JSONB livre). Nenhum campo do formulário existe lá; o
 * formato é definido aqui.
 *
 * O documento é um mapa por aba, de `"1"` a `"9"`, e cada aba carrega os seus
 * campos, os seus anexos em base64 e a sua nota:
 *
 * ```json
 * {
 *   "1": { "nome_proponente": "", ..., "nota": { "valor": null, ... } },
 *   "2": { "business_canvas": "", "nota": { ... } }
 * }
 * ```
 *
 * Os nomes de campo espelham o sistema em React que veio antes.
 */

/** As nove etapas são identificadas pelo número, como no sistema anterior. */
export type NumeroEtapa = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const NUMEROS_ETAPA: readonly NumeroEtapa[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Arquivo anexado a uma etapa, embutido no próprio JSON.
 *
 * Não existe rota de upload no backend, e o documento inteiro trafega a cada
 * gravação — por isso o conteúdo vem em base64 aqui dentro, e por isso há um
 * teto por arquivo (`TAMANHO_MAXIMO_ANEXO`). Quando o endpoint de upload
 * nascer, `conteudo_base64` vira uma URL e o resto da estrutura não muda.
 */
export interface Anexo {
  nome: string;
  tipo: string;
  /** Tamanho do arquivo original, em bytes — antes do base64. */
  tamanho: number;
  /** Conteúdo puro em base64, sem o prefixo `data:`. */
  conteudo_base64: string;
}

/**
 * Teto por arquivo. Base64 infla ~33%, e o JSON inteiro vai em todo PUT.
 * As etapas 6 e 9 aceitam **um arquivo cada** — `arquivos` é lista porque o
 * legado guardava `multiple_files`, e manter o formato evita migrar o JSONB
 * quando o upload de verdade existir.
 */
export const TAMANHO_MAXIMO_ANEXO = 2 * 1024 * 1024;

/** Avaliação do consultor numa etapa: nota de 1 a 5, observações e autor. */
export interface NotaEtapa {
  valor: 1 | 2 | 3 | 4 | 5 | null;
  texto: string;
  avaliador: string | null;
}

export const ROTULO_NOTA: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Ruim',
  2: 'Razoável',
  3: 'Bom',
  4: 'Muito Bom',
  5: 'Excelente',
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

/** Toda aba carrega a sua nota junto. */
interface EtapaBase {
  nota: NotaEtapa;
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

const notaVazia = (): NotaEtapa => ({ valor: null, texto: '', avaliador: null });

/** O documento em branco — é o que o `POST` grava no primeiro acesso. */
export function documentoVazio(): JsonQuestionario {
  return {
    '1': {
      nome_proponente: '',
      nome_negocio: '',
      setor_atuacao: '',
      cnpj: '',
      nota: notaVazia(),
    },
    '2': { business_canvas: '', nota: notaVazia() },
    '3': { sumario_executivo: '', nota: notaVazia() },
    '4': { equipe: [], nota: notaVazia() },
    '5': { planejamento_produto: '', nota: notaVazia() },
    '6': {
      fornecedores: '',
      concorrentes: '',
      analise_acao: '',
      arquivos: [],
      nota: notaVazia(),
    },
    '7': { planejamento_marketing: '', nota: notaVazia() },
    '8': { planejamento_estrutura: '', nota: notaVazia() },
    '9': { observacoes: '', arquivos: [], nota: notaVazia() },
  };
}
