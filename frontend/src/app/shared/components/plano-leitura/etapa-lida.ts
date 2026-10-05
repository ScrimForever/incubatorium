import {
  Anexo,
  ChaveEtapa,
  JsonQuestionario,
  Avaliacao,
  MembroEquipe,
  NumeroEtapa,
} from '../../../core/models/questionario';
import { CAMPOS_ETAPA_1, ETAPAS } from '../../../pages/questionario/etapas';
import { textoParaHtml } from '../../editor/texto-para-html';

/**
 * Uma etapa preenchida, pronta para leitura.
 *
 * Compartilhada entre o `plano-leitura` (as nove de uma vez, nas telas do
 * incubado) e o `plano-etapa-leitura` (uma por vez, no wizard do avaliador).
 */
export interface EtapaLida {
  readonly numero: NumeroEtapa;
  readonly titulo: string;
  /** Pares rótulo/conteúdo. Vazio quando a etapa é equipe. */
  readonly blocos: readonly { rotulo: string; texto: string }[];
  readonly membros: readonly MembroEquipe[];
  readonly arquivos: readonly Anexo[];
  /** A avaliação da etapa — uma só, ou `null` enquanto ninguém avaliou. */
  readonly avaliacao: Avaliacao | null;
  /** A nota da etapa; `null` quando o avaliador só comentou, ou ninguém avaliou. */
  readonly media: number | null;
}

/** Monta a leitura de uma etapa a partir do documento. */
export function montarEtapaLida(json: JsonQuestionario, numero: NumeroEtapa): EtapaLida {
  const avaliacao = json[String(numero) as ChaveEtapa].avaliacao;
  return {
    numero,
    titulo: ETAPAS[numero - 1].titulo,
    blocos: blocosDe(json, numero),
    membros: numero === 4 ? json['4'].equipe : [],
    arquivos: arquivosDe(json, numero),
    avaliacao,
    media: avaliacao?.nota ?? null,
  };
}

/**
 * Média geral do plano: média das notas das etapas pontuadas. Etapa em que o
 * avaliador só comentou não entra na conta — senão baixaria a média de quem
 * pontuou.
 */
export function mediaGeral(etapas: readonly EtapaLida[]): number | null {
  const medias = etapas
    .map((etapa) => etapa.media)
    .filter((valor): valor is number => valor !== null);
  return medias.length ? arredondar(medias.reduce((a, b) => a + b, 0) / medias.length) : null;
}

const arredondar = (valor: number): number => Math.round(valor * 10) / 10;

/** Os textos de uma etapa, na ordem em que o formulário os pede. */
function blocosDe(
  json: JsonQuestionario,
  numero: NumeroEtapa,
): { rotulo: string; texto: string }[] {
  const aba = json[String(numero) as ChaveEtapa] as unknown as Record<string, unknown>;
  if (numero === 1) {
    return CAMPOS_ETAPA_1.map((campo) => ({
      rotulo: campo.rotulo,
      texto: textoParaHtml(String(aba[campo.nome] ?? '')),
    }));
  }
  if (numero === 4) {
    return [];
  }
  // Rótulo vazio em etapa de campo único: o título do cartão já diz o que é.
  // O texto vem do editor, em HTML; o gravado antes dele é convertido.
  return ETAPAS[numero - 1].campos.map((campo) => ({
    rotulo: campo.rotulo,
    texto: textoParaHtml(String(aba[campo.nome] ?? '')),
  }));
}

/** Só as etapas 6 e 9 têm anexos. */
function arquivosDe(json: JsonQuestionario, numero: NumeroEtapa): readonly Anexo[] {
  if (numero === 6) {
    return json['6'].arquivos;
  }
  return numero === 9 ? json['9'].arquivos : [];
}
