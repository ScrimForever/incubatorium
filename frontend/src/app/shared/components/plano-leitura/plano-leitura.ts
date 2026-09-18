import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { QuillViewComponent } from 'ngx-quill';

import {
  Anexo,
  JsonQuestionario,
  MembroEquipe,
  NotaEtapa,
  NumeroEtapa,
  ROTULO_NOTA,
} from '../../../core/models/questionario';
import { CAMPOS_ETAPA_1, ETAPAS } from '../../../pages/questionario/etapas';
import { textoParaHtml } from '../../editor/texto-para-html';
import { Icone } from '../icone/icone';

/** Uma etapa preenchida, pronta para leitura. */
interface EtapaLida {
  readonly numero: NumeroEtapa;
  readonly titulo: string;
  /** Pares rótulo/conteúdo. Vazio quando a etapa é equipe. */
  readonly blocos: readonly { rotulo: string; texto: string }[];
  readonly membros: readonly MembroEquipe[];
  readonly arquivos: readonly Anexo[];
  readonly nota: NotaEtapa;
}

/**
 * As nove etapas do plano em leitura, com a avaliação de cada uma.
 *
 * Compartilhado porque mais de uma tela mostra o mesmo conteúdo: o "Meu plano"
 * dentro do painel, o plano devolvido e, quando existir, a tela de quem avalia.
 */
@Component({
  selector: 'app-plano-leitura',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QuillViewComponent, Icone],
  templateUrl: './plano-leitura.html',
  styleUrl: './plano-leitura.scss',
})
export class PlanoLeitura {
  readonly json = input.required<JsonQuestionario>();

  protected readonly rotuloNota = ROTULO_NOTA;

  protected readonly etapas = computed<EtapaLida[]>(() => {
    const json = this.json();
    return ETAPAS.map((etapa) => ({
      numero: etapa.numero,
      titulo: etapa.titulo,
      blocos: blocosDe(json, etapa.numero),
      membros: etapa.numero === 4 ? json['4'].equipe : [],
      arquivos: arquivosDe(json, etapa.numero),
      nota: json[String(etapa.numero) as keyof JsonQuestionario].nota,
    }));
  });
}

/** Os textos de uma etapa, na ordem em que o formulário os pede. */
function blocosDe(
  json: JsonQuestionario,
  numero: NumeroEtapa,
): { rotulo: string; texto: string }[] {
  const aba = json[String(numero) as keyof JsonQuestionario] as unknown as Record<string, unknown>;
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
