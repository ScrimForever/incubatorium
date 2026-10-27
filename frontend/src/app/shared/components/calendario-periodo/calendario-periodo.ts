import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';

/** Um dia da grade do mês. `data` vazia = casa de preenchimento antes do dia 1. */
interface Casa {
  readonly data: string;
  readonly dia: number;
  readonly desabilitada: boolean;
  readonly inicio: boolean;
  readonly fim: boolean;
  readonly dentro: boolean;
  readonly marcada: boolean;
  readonly rotulo: string;
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** Semana começando na segunda, como a agenda de trabalho. */
const CABECALHO = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const iso = (ano: number, mes: number, dia: number): string =>
  `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

/**
 * O que o clique num dia faz com a seleção: o primeiro escolhe uma data; o
 * segundo, se for outro dia, fecha o período (em qualquer ordem); com o
 * período fechado, um novo clique recomeça.
 */
export function proximaSelecao(de: string, ate: string, clicado: string): [string, string] {
  if (!de || ate || clicado === de) {
    return [clicado, ''];
  }
  return clicado < de ? [clicado, de] : [de, clicado];
}

/**
 * Calendário de um mês que escolhe uma data ou um período no mesmo lugar —
 * o `<input type="date">` nativo só escolhe uma. Datas em `aaaa-mm-dd`.
 */
@Component({
  selector: 'app-calendario-periodo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './calendario-periodo.html',
  styleUrl: './calendario-periodo.scss',
})
export class CalendarioPeriodo {
  readonly de = model('');
  readonly ate = model('');
  /** Primeiro dia que pode ser escolhido. */
  readonly min = input('');
  /** Datas já escolhidas fora daqui, para aparecerem marcadas. */
  readonly marcadas = input<readonly string[]>([]);

  protected readonly cabecalho = CABECALHO;

  /** Mês em exibição: começa no mês do mínimo (ou no atual). */
  private readonly mesVisto = signal(this.mesInicial());

  protected readonly titulo = computed(() => {
    const { ano, mes } = this.mesVisto();
    const nome = MESES[mes];
    return `${nome[0].toUpperCase()}${nome.slice(1)} de ${ano}`;
  });

  /** Não deixa voltar para antes do mês do mínimo. */
  protected readonly podeVoltar = computed(() => {
    const min = this.min();
    const { ano, mes } = this.mesVisto();
    return !min || iso(ano, mes, 1) > min.slice(0, 8) + '01';
  });

  protected readonly casas = computed<Casa[]>(() => {
    const { ano, mes } = this.mesVisto();
    const de = this.de();
    const ate = this.ate();
    const min = this.min();
    const marcadas = new Set(this.marcadas());
    const primeiro = new Date(Date.UTC(ano, mes, 1)).getUTCDay();
    // getUTCDay: 0 = domingo; a grade começa na segunda.
    const vazias = (primeiro + 6) % 7;
    const total = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();

    const casas: Casa[] = Array.from({ length: vazias }, () => ({
      data: '',
      dia: 0,
      desabilitada: true,
      inicio: false,
      fim: false,
      dentro: false,
      marcada: false,
      rotulo: '',
    }));
    for (let dia = 1; dia <= total; dia++) {
      const data = iso(ano, mes, dia);
      casas.push({
        data,
        dia,
        desabilitada: !!min && data < min,
        inicio: data === de,
        fim: data === ate,
        dentro: !!de && !!ate && data > de && data < ate,
        marcada: marcadas.has(data),
        rotulo: `${dia} de ${MESES[mes]} de ${ano}`,
      });
    }
    return casas;
  });

  protected escolher(data: string): void {
    const [de, ate] = proximaSelecao(this.de(), this.ate(), data);
    this.de.set(de);
    this.ate.set(ate);
  }

  protected mudarMes(passo: number): void {
    const { ano, mes } = this.mesVisto();
    const novo = new Date(Date.UTC(ano, mes + passo, 1));
    this.mesVisto.set({ ano: novo.getUTCFullYear(), mes: novo.getUTCMonth() });
  }

  private mesInicial(): { ano: number; mes: number } {
    const hoje = new Date();
    return { ano: hoje.getFullYear(), mes: hoje.getMonth() };
  }
}
