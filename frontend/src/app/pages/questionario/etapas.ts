import { NumeroEtapa } from '../../core/models/questionario';

/** Um campo de texto longo dentro de uma etapa. */
export interface CampoTexto {
  /** Nome do campo dentro da aba, no JSON do questionário. */
  readonly nome: string;
  /** Rótulo acima do campo. Vazio quando a etapa tem um campo só. */
  readonly rotulo: string;
  /** Instrução em tópicos, como no legado. */
  readonly instrucao: readonly string[];
  readonly placeholder: string;
  readonly linhas: number;
  /** Campo que a etapa cobra para liberar a próxima. */
  readonly obrigatorio: boolean;
  /** A legenda vermelha sob o campo quando ele fica vazio. */
  readonly erro: string;
}

/** Uma das nove etapas do wizard. */
export interface Etapa {
  readonly numero: NumeroEtapa;
  readonly titulo: string;
  /** Texto introdutório antes dos tópicos, quando existe. */
  readonly introducao?: string;
  readonly campos: readonly CampoTexto[];
  /** Etapas com natureza própria: equipe (CRUD) e financeiro (anexos). */
  readonly especial?: 'equipe' | 'financeiro';
  /** Etapa 6 também aceita um anexo. */
  readonly anexoUnico?: boolean;
}

/**
 * As nove etapas, com títulos, instruções e nomes de campo copiados do
 * `QuestionarioForm.jsx` do sistema antigo. Mudar qualquer texto daqui muda a
 * tela — nenhum rótulo é escrito no template.
 *
 * **Conferido tópico a tópico contra o legado em 12/09/2026.** Tudo bate,
 * menos quatro divergências **deliberadas** (decisão do usuário) — não
 * "corrigir" de volta sem perguntar:
 *
 * 1. Etapa 5, 4º tópico: o legado escreve "demanda do *marcado*"; aqui é
 *    "mercado". Erro de digitação do original.
 * 2. Etapa 6, 5º tópico: concordância e grafia ajustadas ("que seu negócio",
 *    "Por quê?").
 * 3. Etapa 6, títulos das três seções: **o legado inverte dois deles** — chama
 *    de "Análise dos consumidores/clientes" o bloco de perguntas sobre
 *    fornecedores (campo `analiseFornecedores`) e de "Análise dos fornecedores"
 *    o bloco sobre clientes (`planejamentoMercado`). Aqui cada título descreve
 *    as perguntas que estão abaixo dele.
 * 4. Etapa 9, campo "Observações": não existe no legado, é adição nossa e é
 *    opcional. O único textarea daquela etapa no original é o das notas do
 *    avaliador, que aqui é a `nota` de cada aba.
 */
export const ETAPAS: readonly Etapa[] = [
  {
    numero: 1,
    titulo: 'Setor de atuação',
    campos: [],
  },
  {
    numero: 2,
    titulo: 'Desenvolva o Business Model Canvas para seu negócio',
    introducao: 'No texto, você deverá responder:',
    campos: [
      {
        nome: 'business_canvas',
        obrigatorio: true,
        erro: 'Descreva o Business Model Canvas.',
        rotulo: '',
        instrucao: [
          'Segmento de Clientes',
          'Proposta de Valor',
          'Relacionamento com o cliente',
          'Canais',
          'Fonte de receitas',
          'Atividades Chave',
          'Recursos Chave',
          'Estrutura de Custos',
          'Parcerias',
        ],
        placeholder: 'Descreva o Business Model Canvas do seu negócio',
        linhas: 15,
      },
    ],
  },
  {
    numero: 3,
    titulo: 'Sumário executivo',
    introducao:
      'Faça um texto resumido sobre o negócio no qual pretende desenvolver (máximo 1 página). ' +
      'Recomenda-se que o resumo seja elaborado após o preenchimento de todas as demais etapas. ' +
      'No texto, você deverá responder:',
    campos: [
      {
        nome: 'sumario_executivo',
        obrigatorio: true,
        erro: 'Escreva o sumário executivo.',
        rotulo: '',
        instrucao: [
          'O que é o negócio e o produto e/ou serviço a ser desenvolvido?',
          'Por que irá desenvolver? Descreva a demanda de mercado encontrada.',
          'Onde será desenvolvido? Descreva o local, público-alvo e a concorrência do negócio.',
          'Quem irá desenvolver? Descreva a equipe envolvida no negócio.',
          'Quando irá desenvolver? Descreva quando pretende iniciar o desenvolvimento do produto e/ou serviço.',
          'Como irá desenvolver? Descreva o método utilizado para o desenvolvimento do produto e/ou serviço.',
          'Quanto custa? Identifique o custo necessário para desenvolver o negócio.',
        ],
        placeholder: 'Escreva seu sumário executivo aqui',
        linhas: 15,
      },
    ],
  },
  {
    numero: 4,
    titulo: 'Equipe',
    especial: 'equipe',
    campos: [],
  },
  {
    numero: 5,
    titulo: 'Planejamento/Desenvolvimento do Produto e/ou Serviço',
    campos: [
      {
        nome: 'planejamento_produto',
        obrigatorio: true,
        erro: 'Descreva o produto e/ou serviço.',
        rotulo: '',
        instrucao: [
          'Qual é o Produto e/ou Serviço a ser oferecido?',
          'Quais as principais características do Produto e/ou Serviço?',
          'Em que estágio do Ciclo de Vida se encontra? Desenvolvimento, Introdução no Mercado, Crescimento no Mercado, Maturidade ou Declínio.',
          'Qual a demanda do mercado que o Produto e/ou Serviço irá resolver?',
          'O Produto e/ou Serviço proposto neste negócio caracteriza-se como uma "inovação de produto", "inovação de processo", "inovação de marketing", "inovação organizacional"? Explique.',
        ],
        placeholder: 'Descreva o planejamento/desenvolvimento do produto e/ou serviço',
        linhas: 15,
      },
    ],
  },
  {
    numero: 6,
    titulo: 'Planejamento das ações do Mercado',
    anexoUnico: true,
    campos: [
      {
        nome: 'fornecedores',
        obrigatorio: true,
        erro: 'Descreva a análise dos fornecedores.',
        rotulo: 'Análise dos fornecedores',
        instrucao: [
          'Quais serão os seus fornecedores do seu negócio no presente e/ou futuro?',
          'Onde estão localizados os principais fornecedores do seu negócio?',
        ],
        placeholder: 'Descreva a análise dos fornecedores',
        linhas: 8,
      },
      {
        nome: 'concorrentes',
        obrigatorio: true,
        erro: 'Descreva a análise dos concorrentes.',
        rotulo: 'Análise dos concorrentes',
        instrucao: [
          'Identifique os principais concorrentes do seu negócio. Indique aqueles que são concorrentes diretos (que têm produtos e/ou serviços iguais ou similares aos que você irá oferecer) e os concorrentes indiretos (que não fazem exatamente o mesmo que você, mas podem substituir o seu produto e/ou serviço no mercado).',
          'Indique o diferencial competitivo do seu negócio em comparação com os demais concorrentes.',
        ],
        placeholder: 'Descreva a análise dos concorrentes',
        linhas: 8,
      },
      {
        nome: 'analise_acao',
        obrigatorio: true,
        erro: 'Descreva o planejamento das ações.',
        rotulo: 'Planejamento das ações',
        instrucao: [
          'Qual o segmento de clientes que seu negócio irá atender? Pessoas físicas e/ou jurídicas? Por quê?',
          'Qual(is) variável(is) serão utilizadas para segmentar o mercado? Explique.',
          'Identifique o público-alvo que o negócio espera atingir.',
        ],
        placeholder: 'Descreva o planejamento das ações do mercado',
        linhas: 8,
      },
    ],
  },
  {
    numero: 7,
    titulo: 'Planejamento das ações de Marketing',
    introducao:
      'Descreva a estratégia de Marketing do seu negócio (4Ps + 3Ps). No texto, você deverá descrever:',
    campos: [
      {
        nome: 'planejamento_marketing',
        obrigatorio: true,
        erro: 'Descreva a estratégia de marketing.',
        rotulo: '',
        instrucao: [
          'Produto',
          'Preço',
          'Praça',
          'Promoção',
          'People (Pessoas)',
          'Process (Processos)',
          'Physical Evidence (Evidências Físicas)',
        ],
        placeholder: 'Descreva a estratégia de Marketing do seu negócio',
        linhas: 15,
      },
    ],
  },
  {
    numero: 8,
    titulo: 'Planejamento da Estrutura, Gerência e Operações',
    introducao:
      'Escreva como serão executadas as principais operações na sua empresa. No texto, você deverá responder:',
    campos: [
      {
        nome: 'planejamento_estrutura',
        obrigatorio: true,
        erro: 'Descreva a estrutura, gerência e operações.',
        rotulo: '',
        instrucao: [
          'Construa o organograma para a sua startup. Insira no organograma os cargos contidos na sua startup. Explique por meio de tópicos a função que será realizada por cada cargo.',
          'Construa o(s) fluxograma(s) para demonstrar como será(ão) a(s) principal(is) operação(ões) da startup.',
          'Descreva como será a venda dos Produtos e/ou Serviços (física ou online).',
          'Construa um cronograma de operações das próximas atividades da sua empresa ou startup.',
        ],
        placeholder: 'Descreva o planejamento da estrutura, gerência e operações',
        linhas: 15,
      },
    ],
  },
  {
    numero: 9,
    titulo: 'Planejamento Financeiro',
    introducao: 'Construa o planejamento financeiro.',
    especial: 'financeiro',
    campos: [
      {
        nome: 'observacoes',
        obrigatorio: false,
        erro: '',
        rotulo: 'Observações',
        instrucao: [
          'Utilize a planilha Excel para desenvolver o planejamento financeiro para o seu negócio.',
        ],
        placeholder: 'Observações sobre o planejamento financeiro (opcional)',
        linhas: 6,
      },
    ],
  },
];

/** Os quatro campos curtos da etapa 1, que são inputs de uma linha. */
export const CAMPOS_ETAPA_1 = [
  {
    nome: 'nome_proponente',
    rotulo: 'Nome do proponente',
    placeholder: 'Insira o nome do proponente',
    obrigatorio: true,
    erro: 'Informe o nome do proponente.',
  },
  {
    nome: 'nome_negocio',
    rotulo: 'Nome do negócio',
    placeholder: 'Insira o nome do negócio',
    obrigatorio: true,
    erro: 'Informe o nome do negócio.',
  },
  {
    nome: 'setor_atuacao',
    rotulo: 'Setor de atuação',
    placeholder: 'Insira o setor de atuação',
    obrigatorio: true,
    erro: 'Informe o setor de atuação.',
  },
  // O CNPJ é opcional: o legado nunca o cobrou, e há negócio sem CNPJ ainda.
  { nome: 'cnpj', rotulo: 'CNPJ', placeholder: 'Insira o CNPJ', obrigatorio: false, erro: '' },
] as const;

/**
 * Rótulo curto para a trilha do topo. Os títulos completos do legado são longos
 * demais para uma pílula — eles continuam inteiros no cabeçalho do cartão.
 */
export const ROTULO_CURTO: Record<NumeroEtapa, string> = {
  1: 'Negócio',
  2: 'Canvas',
  3: 'Sumário',
  4: 'Equipe',
  5: 'Produto',
  6: 'Mercado',
  7: 'Marketing',
  8: 'Estrutura',
  9: 'Financeiro',
};

export const etapaPorNumero = (numero: NumeroEtapa): Etapa => ETAPAS[numero - 1] as Etapa;
