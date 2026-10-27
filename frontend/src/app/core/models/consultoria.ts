/**
 * Agenda de consultoria — espelha `src/domain/schemas/consultoria_schema.py`.
 * `data` e as horas da janela são de parede, no fuso da incubadora (São Paulo);
 * `inicio`/`fim` dos horários vêm em UTC (ISO com `Z`).
 */

/** Uma fatia reservável. `incubado_email` nulo = livre. */
export interface Horario {
  id: number;
  janela_id: number;
  consultor_email: string;
  inicio: string;
  fim: string;
  incubado_email: string | null;
  reservado_em: string | null;
}

/** Um bloco contínuo de atendimento num dia (ex.: 09:00 às 11:00, de 45 em 45). */
export interface Janela {
  id: number;
  consultor_email: string;
  /** `aaaa-mm-dd`. */
  data: string;
  /** `hh:mm:ss`. */
  hora_inicio: string;
  hora_fim: string;
  duracao_minutos: number;
  horarios: Horario[];
}

/** Uma faixa a abrir. Horas em `hh:mm`. */
export interface Bloco {
  hora_inicio: string;
  hora_fim: string;
  duracao_minutos: number;
}

/** Corpo do `POST /consultorias/agenda`: os mesmos blocos em cada data. */
export interface AgendaInput {
  datas: string[];
  blocos: Bloco[];
}

/** Corpo do `PATCH /consultorias/janelas/{id}`: só o que muda. */
export interface JanelaUpdate {
  hora_inicio?: string;
  hora_fim?: string;
  duracao_minutos?: number;
}

/** Corpo do `PATCH /consultorias/horarios/{id}`. */
export interface HorarioUpdate {
  hora_inicio: string;
  hora_fim: string;
}

/** Resposta dos cancelamentos de janela e de dia. */
export interface CancelamentoOutput {
  janelas_canceladas: number;
  reservas_canceladas: number;
}
