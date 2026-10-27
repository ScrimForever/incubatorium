import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Janela } from '../models/consultoria';
import {
  ConsultoriasService,
  conflitoComAgenda,
  consultoriasMarcadas,
  dataLocal,
  datasDoPeriodo,
  erroDoPeriodo,
  errosDaFaixa,
  errosRemarcacao,
  faixasSemTirados,
  fatiar,
  hojeLocal,
  horaLocal,
  porDia,
  rotuloData,
  rotuloDataCurto,
  sobreposicoes,
} from './consultorias';

const JANELA: Janela = {
  id: 1,
  consultor_email: 'avaliador.teste@teccampos.com',
  data: '2026-11-03',
  hora_inicio: '09:00:00',
  hora_fim: '11:00:00',
  duracao_minutos: 45,
  horarios: [],
};

describe('fatiar', () => {
  it('descarta a sobra menor que a duração, como o backend', () => {
    expect(fatiar('09:00', '11:00', 45)).toEqual(['09:00', '09:45']);
  });

  it('a última fatia pode terminar exatamente no fim', () => {
    expect(fatiar('14:00', '15:00', 30)).toEqual(['14:00', '14:30']);
  });

  it('faixa invertida, vazia ou duração inválida não gera horário', () => {
    expect(fatiar('11:00', '09:00', 30)).toEqual([]);
    expect(fatiar('', '09:00', 30)).toEqual([]);
    expect(fatiar('09:00', '10:00', 0)).toEqual([]);
    expect(fatiar('09:00', '09:20', 30)).toEqual([]);
  });

  it('aceita a hora com segundos que a API devolve', () => {
    expect(fatiar('09:00:00', '10:00:00', 60)).toEqual(['09:00']);
  });
});

describe('datas no fuso da incubadora', () => {
  it('converte o UTC da API para a hora de São Paulo', () => {
    expect(horaLocal('2026-11-03T12:00:00Z')).toBe('09:00');
  });

  it('hoje é o dia de São Paulo, mesmo depois da meia-noite UTC', () => {
    expect(hojeLocal(new Date('2026-11-04T01:30:00Z'))).toBe('2026-11-03');
  });

  it('o rótulo curto cabe num chip', () => {
    expect(rotuloDataCurto('2026-11-03')).toBe('ter 03/11');
  });

  it('o rótulo do dia não escorrega por fuso', () => {
    expect(rotuloData('2026-11-03')).toBe('terça-feira, 03/11');
  });
});

describe('consultoriasMarcadas', () => {
  const horario = (id: number, inicio: string, incubado: string | null) => ({
    id,
    janela_id: 1,
    consultor_email: JANELA.consultor_email,
    inicio,
    fim: inicio,
    incubado_email: incubado,
    reservado_em: incubado ? '2026-10-25T16:00:00Z' : null,
  });

  it('fica só com os horários reservados, em ordem de início entre as janelas', () => {
    const tarde: Janela = {
      ...JANELA,
      id: 2,
      horarios: [horario(3, '2026-11-03T17:00:00Z', 'b@x.com')],
    };
    const manha: Janela = {
      ...JANELA,
      horarios: [
        horario(1, '2026-11-03T12:00:00Z', null),
        horario(2, '2026-11-03T12:45:00Z', 'a@x.com'),
      ],
    };
    const marcadas = consultoriasMarcadas([tarde, manha], '2026-11-03T08:00:00Z');
    expect(marcadas.map((m) => m.horario.id)).toEqual([2, 3]);
    expect(marcadas[0].incubado).toBe('a@x.com');
    expect(marcadas[0].janela.id).toBe(1);
  });

  it('agenda sem reserva não tem consultoria', () => {
    expect(consultoriasMarcadas([JANELA])).toEqual([]);
  });

  it('a conversa de hoje que já terminou não é próxima', () => {
    const janela: Janela = {
      ...JANELA,
      horarios: [
        { ...horario(1, '2026-11-03T12:00:00Z', 'a@x.com'), fim: '2026-11-03T12:45:00Z' },
        { ...horario(2, '2026-11-03T13:00:00Z', 'b@x.com'), fim: '2026-11-03T13:45:00Z' },
      ],
    };
    // 13:10Z: a primeira acabou, a segunda está em andamento.
    expect(consultoriasMarcadas([janela], '2026-11-03T13:10:00Z').map((m) => m.horario.id)).toEqual(
      [2],
    );
  });
});

describe('porDia', () => {
  const livre = (id: number, inicio: string) => ({
    id,
    janela_id: 1,
    consultor_email: 'c@x.com',
    inicio,
    fim: inicio,
    incubado_email: null,
    reservado_em: null,
  });

  it('agrupa pelo dia de São Paulo, em ordem', () => {
    const grupos = porDia([
      livre(3, '2026-11-05T12:00:00Z'),
      livre(2, '2026-11-04T01:30:00Z'),
      livre(1, '2026-11-03T12:00:00Z'),
    ]);
    // 01:30Z do dia 4 ainda é dia 3 em São Paulo (22:30).
    expect(grupos.map((g) => g.data)).toEqual(['2026-11-03', '2026-11-05']);
    expect(grupos[0].horarios.map((h) => h.id)).toEqual([1, 2]);
  });

  it('dataLocal converte o instante para o dia da incubadora', () => {
    expect(dataLocal('2026-11-04T02:59:00Z')).toBe('2026-11-03');
    expect(dataLocal('2026-11-04T03:00:00Z')).toBe('2026-11-04');
  });
});

describe('período de datas', () => {
  const UTEIS = [1, 2, 3, 4, 5];

  it('sem data final, é só a inicial, em qualquer dia da semana', () => {
    expect(datasDoPeriodo('2026-11-07', '', UTEIS)).toEqual(['2026-11-07']);
  });

  it('filtra o período pelos dias da semana marcados', () => {
    // 02/11/2026 é segunda; 08/11, domingo.
    expect(datasDoPeriodo('2026-11-02', '2026-11-08', UTEIS)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
    ]);
    expect(datasDoPeriodo('2026-11-02', '2026-11-08', [6, 0])).toEqual([
      '2026-11-07',
      '2026-11-08',
    ]);
  });

  it('atravessa a virada de mês', () => {
    expect(datasDoPeriodo('2026-11-30', '2026-12-01', UTEIS)).toEqual(['2026-11-30', '2026-12-01']);
  });

  it('explica o que impede o período', () => {
    const hoje = '2026-10-26';
    expect(erroDoPeriodo('', '', UTEIS, hoje)).toBe('Escolha a data inicial.');
    expect(erroDoPeriodo('2026-10-25', '', UTEIS, hoje)).toBe('A data inicial já passou.');
    expect(erroDoPeriodo('2026-11-05', '2026-11-02', UTEIS, hoje)).toBe(
      'A data final é anterior à inicial.',
    );
    expect(erroDoPeriodo('2026-11-02', '2027-03-01', UTEIS, hoje)).toContain('passa de');
    expect(erroDoPeriodo('2026-11-02', '2026-11-06', [], hoje)).toBe(
      'Marque ao menos um dia da semana.',
    );
    expect(erroDoPeriodo('2026-11-02', '2026-11-06', [0], hoje)).toContain('Nenhum dia');
  });

  it('aceita hoje e um período válido', () => {
    expect(erroDoPeriodo('2026-10-26', '', UTEIS, '2026-10-26')).toBe('');
    expect(erroDoPeriodo('2026-11-02', '2026-11-30', UTEIS, '2026-10-26')).toBe('');
  });
});

describe('errosDaFaixa', () => {
  it('faixa certa não tem erro', () => {
    expect(errosDaFaixa({ hora_inicio: '09:00', hora_fim: '12:00', duracao_minutos: 45 })).toEqual({
      inicio: '',
      fim: '',
      duracao: '',
    });
  });

  it('cobra os campos vazios', () => {
    const erros = errosDaFaixa({ hora_inicio: '', hora_fim: '', duracao_minutos: '' });
    expect(erros.inicio).toBe('Informe o início.');
    expect(erros.fim).toBe('Informe o fim.');
    expect(erros.duracao).toBe('Informe a duração.');
  });

  it('o fim tem de vir depois do início', () => {
    expect(errosDaFaixa({ hora_inicio: '12:00', hora_fim: '09:00', duracao_minutos: 30 }).fim).toBe(
      'O fim tem de ser depois do início.',
    );
  });

  it('a duração tem mínimo, é inteira e cabe na faixa', () => {
    const faixa = { hora_inicio: '09:00', hora_fim: '10:00' };
    expect(errosDaFaixa({ ...faixa, duracao_minutos: 5 }).duracao).toBe('Mínimo de 10 minutos.');
    expect(errosDaFaixa({ ...faixa, duracao_minutos: 12.5 }).duracao).toBe('Use minutos inteiros.');
    expect(errosDaFaixa({ ...faixa, duracao_minutos: 90 }).duracao).toBe(
      'A duração não cabe na faixa.',
    );
    expect(errosDaFaixa({ ...faixa, duracao_minutos: 60 }).duracao).toBe('');
  });

  it('com hoje entre as datas, o início não pode ter passado', () => {
    const faixa = { hora_inicio: '09:00', hora_fim: '12:00', duracao_minutos: 30 };
    expect(errosDaFaixa(faixa, '10:15').inicio).toContain('já passou');
    expect(errosDaFaixa(faixa, '08:00').inicio).toBe('');
  });
});

describe('faixasSemTirados', () => {
  const faixa = { hora_inicio: '09:00', hora_fim: '12:00', duracao_minutos: 45 };

  it('sem horário tirado, a faixa vai igual — só a sobra some', () => {
    expect(faixasSemTirados(faixa, [])).toEqual([
      { hora_inicio: '09:00', hora_fim: '12:00', duracao_minutos: 45 },
    ]);
  });

  it('tirar um do meio parte a faixa em duas', () => {
    expect(faixasSemTirados(faixa, ['09:45'])).toEqual([
      { hora_inicio: '09:00', hora_fim: '09:45', duracao_minutos: 45 },
      { hora_inicio: '10:30', hora_fim: '12:00', duracao_minutos: 45 },
    ]);
  });

  it('tirar das pontas encurta a faixa', () => {
    expect(faixasSemTirados(faixa, ['09:00', '11:15'])).toEqual([
      { hora_inicio: '09:45', hora_fim: '11:15', duracao_minutos: 45 },
    ]);
  });

  it('as faixas geradas fatiam de volta exatamente nos mantidos', () => {
    const partes = faixasSemTirados(faixa, ['10:30']);
    const refeitos = partes.flatMap((p) => fatiar(p.hora_inicio, p.hora_fim, p.duracao_minutos));
    expect(refeitos).toEqual(['09:00', '09:45', '11:15']);
  });

  it('tirar todos não deixa faixa', () => {
    expect(faixasSemTirados(faixa, ['09:00', '09:45', '10:30', '11:15'])).toEqual([]);
  });
});

describe('errosRemarcacao', () => {
  const janela = { data: '2026-11-03', hora_inicio: '09:00:00', hora_fim: '12:00:00' };

  it('dentro da faixa e no futuro não tem erro', () => {
    expect(errosRemarcacao('10:00', '10:45', janela, '2026-10-26', '15:00')).toEqual({
      inicio: '',
      fim: '',
    });
  });

  it('não sai da faixa da janela', () => {
    expect(errosRemarcacao('08:30', '09:15', janela, '2026-10-26', '').inicio).toBe(
      'A faixa começa às 09:00.',
    );
    expect(errosRemarcacao('11:30', '12:15', janela, '2026-10-26', '').fim).toBe(
      'A faixa termina às 12:00.',
    );
  });

  it('o fim vem depois do início, e os dois são obrigatórios', () => {
    expect(errosRemarcacao('10:00', '09:30', janela, '2026-10-26', '').fim).toContain('depois');
    expect(errosRemarcacao('', '', janela, '2026-10-26', '')).toEqual({
      inicio: 'Informe o início.',
      fim: 'Informe o fim.',
    });
  });

  it('na janela de hoje, não volta para o passado', () => {
    expect(errosRemarcacao('10:00', '10:30', janela, '2026-11-03', '10:20').inicio).toContain(
      'já passou',
    );
  });
});

describe('conflitoComAgenda', () => {
  const publicadas = [{ data: '2026-11-03', hora_inicio: '10:00:00', hora_fim: '11:00:00' }];

  it('avisa a faixa nova que se sobrepõe à agenda do mesmo dia', () => {
    const faixas = [
      { hora_inicio: '14:00', hora_fim: '15:00' },
      { hora_inicio: '09:00', hora_fim: '12:00' },
    ];
    expect(conflitoComAgenda(['2026-11-03'], faixas, publicadas)).toBe(
      'Em ter 03/11 você já atende das 10:00 às 11:00: a faixa 2 se sobrepõe.',
    );
  });

  it('encostar não é sobrepor, e outro dia não conta', () => {
    expect(
      conflitoComAgenda(['2026-11-03'], [{ hora_inicio: '11:00', hora_fim: '12:00' }], publicadas),
    ).toBe('');
    expect(
      conflitoComAgenda(['2026-11-04'], [{ hora_inicio: '10:00', hora_fim: '11:00' }], publicadas),
    ).toBe('');
  });
});

describe('sobreposicoes', () => {
  it('aponta a faixa com que cada uma se sobrepõe', () => {
    expect(
      sobreposicoes([
        { hora_inicio: '09:00', hora_fim: '12:00' },
        { hora_inicio: '11:00', hora_fim: '13:00' },
        { hora_inicio: '14:00', hora_fim: '17:00' },
      ]),
    ).toEqual([2, 1, 0]);
  });

  it('faixas encostadas não se sobrepõem', () => {
    expect(
      sobreposicoes([
        { hora_inicio: '09:00', hora_fim: '12:00' },
        { hora_inicio: '12:00', hora_fim: '13:00' },
      ]),
    ).toEqual([0, 0]);
  });
});

describe('ConsultoriasService', () => {
  let service: ConsultoriasService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ConsultoriasService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('abre agenda com datas e blocos no corpo', () => {
    const entrada = {
      datas: ['2026-11-03'],
      blocos: [{ hora_inicio: '09:00', hora_fim: '11:00', duracao_minutos: 45 }],
    };
    let janelas: Janela[] | undefined;
    service.abrirAgenda(entrada).subscribe((r) => (janelas = r));

    const req = backend.expectOne('/api/consultorias/agenda');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(entrada);
    req.flush([JANELA]);
    expect(janelas?.[0].id).toBe(1);
  });

  it('lê a agenda do consultor', () => {
    service.minhaAgenda().subscribe();
    expect(backend.expectOne('/api/consultorias/agenda/minha').request.method).toBe('GET');
  });

  it('edita e cancela uma janela pelo id', () => {
    service.editarJanela(7, { duracao_minutos: 30 }).subscribe();
    const editar = backend.expectOne('/api/consultorias/janelas/7');
    expect(editar.request.method).toBe('PATCH');
    expect(editar.request.body).toEqual({ duracao_minutos: 30 });

    service.cancelarJanela(7).subscribe();
    expect(backend.expectOne('/api/consultorias/janelas/7').request.method).toBe('DELETE');
  });

  it('cancela dias inteiros por POST, com as datas no corpo', () => {
    service.cancelarDias(['2026-11-03']).subscribe();
    const req = backend.expectOne('/api/consultorias/janelas/cancelar');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ datas: ['2026-11-03'] });
  });

  it('remarca um horário', () => {
    service.remarcarHorario(3, { hora_inicio: '10:00', hora_fim: '10:45' }).subscribe();
    const req = backend.expectOne('/api/consultorias/horarios/3');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ hora_inicio: '10:00', hora_fim: '10:45' });
  });

  it('lista livres, com ou sem filtro de consultor', () => {
    service.livres().subscribe();
    backend.expectOne('/api/consultorias/horarios');

    service.livres('ana@teccampos.com').subscribe();
    backend.expectOne('/api/consultorias/horarios?consultor=ana%40teccampos.com');
  });

  it('reserva e cancela a reserva do incubado', () => {
    service.reservar(5).subscribe();
    expect(backend.expectOne('/api/consultorias/horarios/5/reservar').request.method).toBe('POST');

    service.cancelarReserva(5).subscribe();
    expect(backend.expectOne('/api/consultorias/horarios/5/reserva').request.method).toBe('DELETE');

    service.minhas().subscribe();
    backend.expectOne('/api/consultorias/minhas');
  });
});
