import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ROUTES } from '../constants/api-routes';
import { Api } from '../http/api';
import {
  AgendaInput,
  Bloco,
  CancelamentoOutput,
  Horario,
  HorarioUpdate,
  Janela,
  JanelaUpdate,
} from '../models/consultoria';

/** Fuso em que o backend interpreta datas e horas de parede (`src/shared/datas.py`). */
export const FUSO_INCUBADORA = 'America/Sao_Paulo';

/**
 * Agenda de consultoria, as onze rotas de `/consultorias`. As regras (passado,
 * sobreposição, reserva dupla) são do backend; a tela só repete a de fatiar,
 * para mostrar a prévia antes de publicar.
 */
@Injectable({ providedIn: 'root' })
export class ConsultoriasService {
  private readonly api = inject(Api);

  // --- consultor ---

  abrirAgenda(entrada: AgendaInput): Observable<Janela[]> {
    return this.api.post<Janela[]>(API_ROUTES.consultorias.agenda, entrada);
  }

  minhaAgenda(): Observable<Janela[]> {
    return this.api.get<Janela[]>(API_ROUTES.consultorias.minhaAgenda);
  }

  /** Os horários livres voltam com ids novos: releia a agenda depois. */
  editarJanela(id: number, alteracao: JanelaUpdate): Observable<Janela> {
    return this.api.patch<Janela>(API_ROUTES.consultorias.janela(id), alteracao);
  }

  cancelarJanela(id: number): Observable<CancelamentoOutput> {
    return this.api.delete<CancelamentoOutput>(API_ROUTES.consultorias.janela(id));
  }

  cancelarDias(datas: string[]): Observable<CancelamentoOutput> {
    return this.api.post<CancelamentoOutput>(API_ROUTES.consultorias.cancelarDias, { datas });
  }

  /** Remarca dentro da mesma janela; o backend avisa o incubado por e-mail. */
  remarcarHorario(id: number, alteracao: HorarioUpdate): Observable<Horario> {
    return this.api.patch<Horario>(API_ROUTES.consultorias.horario(id), alteracao);
  }

  /** Hoje responde 500 no backend (`MissingGreenlet`) — a tela ainda não oferece. */
  tirarHorario(id: number): Observable<void> {
    return this.api.delete<void>(API_ROUTES.consultorias.horario(id));
  }

  // --- incubado ---

  livres(consultor?: string): Observable<Horario[]> {
    const filtro = consultor ? `?consultor=${encodeURIComponent(consultor)}` : '';
    return this.api.get<Horario[]>(`${API_ROUTES.consultorias.livres}${filtro}`);
  }

  minhas(): Observable<Horario[]> {
    return this.api.get<Horario[]>(API_ROUTES.consultorias.minhas);
  }

  reservar(id: number): Observable<Horario> {
    return this.api.post<Horario>(API_ROUTES.consultorias.reservar(id));
  }

  /** Hoje responde 500 no backend (`FOR UPDATE` com outer join). */
  cancelarReserva(id: number): Observable<void> {
    return this.api.delete<void>(API_ROUTES.consultorias.reserva(id));
  }
}

/** Um horário reservado, com a janela de onde veio — o que o consultor chama de consultoria. */
export interface ConsultoriaMarcada {
  horario: Horario;
  janela: Janela;
  incubado: string;
}

/**
 * As consultorias marcadas da agenda do consultor: só os horários com reserva,
 * ainda por terminar, em ordem de início. A API não guarda status — reservado é marcado, e o que
 * foi cancelado ou já passou não volta em `agenda/minha`.
 */
export function consultoriasMarcadas(
  janelas: Janela[],
  agora = new Date().toISOString(),
): ConsultoriaMarcada[] {
  // A agenda vem "de hoje em diante" por data: as conversas de hoje que já
  // terminaram também vêm, e não são próximas.
  const instante = Date.parse(agora);
  return janelas
    .flatMap((janela) =>
      janela.horarios
        .filter((horario) => horario.incubado_email && Date.parse(horario.fim) > instante)
        .map((horario) => ({ horario, janela, incubado: horario.incubado_email ?? '' })),
    )
    .sort((a, b) => a.horario.inicio.localeCompare(b.horario.inicio));
}

/** `hh:mm` ou `hh:mm:ss` em minutos desde a meia-noite. */
export function minutosDe(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function hhmm(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

/**
 * Os inícios dos horários que o backend vai criar, pela mesma regra
 * (`_fatiar`): fatias consecutivas de `duracao` minutos, e a sobra menor que a
 * duração é descartada. Faixa inválida devolve lista vazia.
 */
export function fatiar(inicio: string, fim: string, duracao: number): string[] {
  if (!inicio || !fim || !(duracao > 0)) {
    return [];
  }
  const limite = minutosDe(fim);
  const inicios: string[] = [];
  for (let atual = minutosDe(inicio); atual + duracao <= limite; atual += duracao) {
    inicios.push(hhmm(atual));
  }
  return inicios;
}

// --- validação da abertura de agenda ---
// O backend recusa passado e sobreposição (422/409); a tela avisa antes, campo a
// campo, para o consultor não descobrir o erro só depois de publicar.

/** Duração mínima de um horário, em minutos. */
export const DURACAO_MINIMA = 10;
/** Um período maior que isto é quase sempre engano de digitação no ano. */
export const PERIODO_MAXIMO_DIAS = 92;

/** Os dias da semana na ordem da tela; `dia` é o `getUTCDay()` (0 = domingo). */
export const DIAS_SEMANA: readonly { dia: number; rotulo: string }[] = [
  { dia: 1, rotulo: 'Seg' },
  { dia: 2, rotulo: 'Ter' },
  { dia: 3, rotulo: 'Qua' },
  { dia: 4, rotulo: 'Qui' },
  { dia: 5, rotulo: 'Sex' },
  { dia: 6, rotulo: 'Sáb' },
  { dia: 0, rotulo: 'Dom' },
];

function emUtc(data: string): Date {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** Dias corridos de `de` a `ate`, contando os dois. */
function diasEntre(de: string, ate: string): number {
  return Math.round((emUtc(ate).getTime() - emUtc(de).getTime()) / 86_400_000) + 1;
}

/**
 * As datas (`aaaa-mm-dd`) de `de` a `ate` que caem nos dias da semana pedidos.
 * Sem `ate`, é só `de`, qualquer que seja o dia da semana.
 */
export function datasDoPeriodo(de: string, ate: string, diasSemana: readonly number[]): string[] {
  if (!de) {
    return [];
  }
  if (!ate || ate === de) {
    return [de];
  }
  const datas: string[] = [];
  for (let atual = emUtc(de); atual <= emUtc(ate); atual.setUTCDate(atual.getUTCDate() + 1)) {
    if (diasSemana.includes(atual.getUTCDay())) {
      datas.push(atual.toISOString().slice(0, 10));
    }
  }
  return datas;
}

/** O que impede de adicionar o período, ou vazio quando está tudo certo. */
export function erroDoPeriodo(
  de: string,
  ate: string,
  diasSemana: readonly number[],
  hoje: string,
): string {
  if (!de) {
    return 'Escolha a data inicial.';
  }
  if (de < hoje) {
    return 'A data inicial já passou.';
  }
  if (!ate || ate === de) {
    return '';
  }
  if (ate < de) {
    return 'A data final é anterior à inicial.';
  }
  if (diasEntre(de, ate) > PERIODO_MAXIMO_DIAS) {
    return `O período passa de ${PERIODO_MAXIMO_DIAS} dias. Abra a agenda em partes.`;
  }
  if (!diasSemana.length) {
    return 'Marque ao menos um dia da semana.';
  }
  if (!datasDoPeriodo(de, ate, diasSemana).length) {
    return 'Nenhum dia do período cai nos dias da semana marcados.';
  }
  return '';
}

/** Uma faixa como o formulário a tem — a duração pode vir como texto. */
export interface FaixaDigitada {
  hora_inicio?: string;
  hora_fim?: string;
  duracao_minutos?: number | string | null;
}

/** Erro de cada campo da faixa; vazio = campo certo. */
export interface ErrosDaFaixa {
  inicio: string;
  fim: string;
  duracao: string;
}

/**
 * Os erros de uma faixa. `agoraHoje` é a hora atual (`hh:mm`) quando hoje está
 * entre as datas escolhidas — aí o início não pode ter passado.
 */
export function errosDaFaixa(faixa: FaixaDigitada, agoraHoje = ''): ErrosDaFaixa {
  const inicio = faixa.hora_inicio ?? '';
  const fim = faixa.hora_fim ?? '';
  const bruta = faixa.duracao_minutos;
  const duracao = Number(bruta);
  const erros: ErrosDaFaixa = { inicio: '', fim: '', duracao: '' };

  if (!inicio) {
    erros.inicio = 'Informe o início.';
  } else if (agoraHoje && inicio <= agoraHoje) {
    erros.inicio = `Hoje este início já passou (agora são ${agoraHoje}).`;
  }
  if (!fim) {
    erros.fim = 'Informe o fim.';
  } else if (inicio && minutosDe(fim) <= minutosDe(inicio)) {
    erros.fim = 'O fim tem de ser depois do início.';
  }
  if (bruta === null || bruta === undefined || bruta === '') {
    erros.duracao = 'Informe a duração.';
  } else if (!Number.isInteger(duracao)) {
    erros.duracao = 'Use minutos inteiros.';
  } else if (duracao < DURACAO_MINIMA) {
    erros.duracao = `Mínimo de ${DURACAO_MINIMA} minutos.`;
  } else if (inicio && fim && !erros.fim && duracao > minutosDe(fim) - minutosDe(inicio)) {
    erros.duracao = 'A duração não cabe na faixa.';
  }
  return erros;
}

/** Para cada faixa, o número (1-based) da primeira outra com que se sobrepõe; 0 = nenhuma. */
export function sobreposicoes(faixas: readonly FaixaDigitada[]): number[] {
  const intervalo = (f: FaixaDigitada) =>
    f.hora_inicio && f.hora_fim ? [minutosDe(f.hora_inicio), minutosDe(f.hora_fim)] : null;
  return faixas.map((faixa, i) => {
    const a = intervalo(faixa);
    if (!a || a[1] <= a[0]) {
      return 0;
    }
    const outra = faixas.findIndex((f, j) => {
      const b = intervalo(f);
      return j !== i && !!b && b[1] > b[0] && a[0] < b[1] && b[0] < a[1];
    });
    return outra + 1;
  });
}

/** Erros do remarcar; vazio = campo certo. */
export interface ErrosRemarcacao {
  inicio: string;
  fim: string;
}

/**
 * Remarcar um horário: dentro da faixa da janela e, se a janela é de hoje, não
 * no passado. Sobreposição com outro horário só o servidor sabe (ele tem todos).
 */
export function errosRemarcacao(
  inicio: string,
  fim: string,
  janela: Pick<Janela, 'data' | 'hora_inicio' | 'hora_fim'>,
  hoje: string,
  agora: string,
): ErrosRemarcacao {
  const erros: ErrosRemarcacao = { inicio: '', fim: '' };
  const faixaIni = janela.hora_inicio.slice(0, 5);
  const faixaFim = janela.hora_fim.slice(0, 5);
  if (!inicio) {
    erros.inicio = 'Informe o início.';
  } else if (inicio < faixaIni) {
    erros.inicio = `A faixa começa às ${faixaIni}.`;
  } else if (janela.data === hoje && inicio <= agora) {
    erros.inicio = `Hoje este início já passou (agora são ${agora}).`;
  }
  if (!fim) {
    erros.fim = 'Informe o fim.';
  } else if (inicio && fim <= inicio) {
    erros.fim = 'O fim tem de ser depois do início.';
  } else if (fim > faixaFim) {
    erros.fim = `A faixa termina às ${faixaFim}.`;
  }
  return erros;
}

/**
 * A primeira sobreposição entre as faixas novas e a agenda que já existe nas
 * mesmas datas — o servidor recusa o lote inteiro por uma só, então a tela
 * avisa antes. Vazio quando não há conflito.
 */
export function conflitoComAgenda(
  datas: readonly string[],
  faixas: readonly FaixaDigitada[],
  publicadas: readonly Pick<Janela, 'data' | 'hora_inicio' | 'hora_fim'>[],
): string {
  for (const data of datas) {
    const doDia = publicadas.filter((janela) => janela.data === data);
    for (const [i, faixa] of faixas.entries()) {
      if (!faixa.hora_inicio || !faixa.hora_fim) {
        continue;
      }
      const ini = minutosDe(faixa.hora_inicio);
      const fim = minutosDe(faixa.hora_fim);
      const choque = doDia.find(
        (janela) => ini < minutosDe(janela.hora_fim) && minutosDe(janela.hora_inicio) < fim,
      );
      if (choque) {
        return `Em ${rotuloDataCurto(data)} você já atende das ${choque.hora_inicio.slice(0, 5)} às ${choque.hora_fim.slice(0, 5)}: a faixa ${i + 1} se sobrepõe.`;
      }
    }
  }
  return '';
}

/**
 * Uma faixa sem os horários que o consultor tirou da prévia. A API só fatia
 * faixas contínuas, então cada sequência de horários mantidos vira uma faixa
 * própria: 09:00–12:00 de 45 sem o 09:45 vira 09:00–09:45 e 10:30–12:00.
 */
export function faixasSemTirados(faixa: Bloco, tirados: readonly string[]): Bloco[] {
  const duracao = faixa.duracao_minutos;
  const mantidos = fatiar(faixa.hora_inicio, faixa.hora_fim, duracao).filter(
    (inicio) => !tirados.includes(inicio),
  );
  const faixas: Bloco[] = [];
  for (const inicio of mantidos) {
    const ultima = faixas.at(-1);
    if (ultima && ultima.hora_fim === inicio) {
      ultima.hora_fim = hhmm(minutosDe(inicio) + duracao);
    } else {
      faixas.push({
        hora_inicio: inicio,
        hora_fim: hhmm(minutosDe(inicio) + duracao),
        duracao_minutos: duracao,
      });
    }
  }
  return faixas;
}

/** Hora de parede (`hh:mm`) de um instante UTC, no fuso da incubadora. */
export function horaLocal(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: FUSO_INCUBADORA,
  }).format(new Date(iso));
}

/** `aaaa-mm-dd` de hoje no fuso da incubadora — o mínimo que o seletor aceita. */
export function hojeLocal(agora = new Date()): string {
  return dataLocal(agora.toISOString());
}

/** `aaaa-mm-dd` de um instante UTC no fuso da incubadora. */
export function dataLocal(iso: string): string {
  // `en-CA` formata como aaaa-mm-dd, o valor do <input type="date">.
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_INCUBADORA }).format(new Date(iso));
}

/**
 * Horários agrupados pelo dia local de início, dias e horários em ordem. O
 * incubado não vê janela — só horário —, então o dia sai do `inicio`.
 */
export function porDia(horarios: Horario[]): { data: string; horarios: Horario[] }[] {
  const grupos = new Map<string, Horario[]>();
  for (const horario of [...horarios].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    const data = dataLocal(horario.inicio);
    grupos.set(data, [...(grupos.get(data) ?? []), horario]);
  }
  return [...grupos.entries()].map(([data, lista]) => ({ data, horarios: lista }));
}

/** "ter 03/11" — o rótulo curto dos chips, para muitas datas caberem lado a lado. */
export function rotuloDataCurto(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number);
  const semana = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(ano, mes - 1, dia, 12)))
    .replace('.', '');
  return `${semana} ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
}

/** "terça-feira, 03/11" a partir de `aaaa-mm-dd`, sem passar por fuso. */
export function rotuloData(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number);
  const meioDia = new Date(Date.UTC(ano, mes - 1, dia, 12));
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(meioDia);
}
