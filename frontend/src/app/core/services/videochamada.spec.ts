import { TestBed } from '@angular/core/testing';

import { Horario } from '../models/consultoria';
import { JitsiApi, JitsiConstrutor, JitsiOpcoes } from '../models/videochamada';
import { JITSI, Participante, VideochamadaService, nomeDaSala } from './videochamada';

const horario = (id: number, incubado: string | null = 'inc@x.com'): Horario => ({
  id,
  janela_id: 1,
  consultor_email: 'cons@x.com',
  inicio: '2026-11-10T12:00:00Z',
  fim: '2026-11-10T12:45:00Z',
  incubado_email: incubado,
  reservado_em: null,
});

const consultor: Participante = { nome: 'Cons', email: 'cons@x.com', papel: 'anfitriao' };
const incubado: Participante = { nome: 'Ana', email: 'ana@x.com', papel: 'convidado' };

describe('VideochamadaService', () => {
  let criadas: { dominio: string; opcoes: JitsiOpcoes }[];
  let ouvintes: Record<string, (e?: unknown) => void>;
  let api: jasmine.SpyObj<JitsiApi>;

  beforeEach(() => {
    criadas = [];
    ouvintes = {};
    api = jasmine.createSpyObj<JitsiApi>('JitsiApi', ['addListener', 'executeCommand', 'dispose']);
    api.addListener.and.callFake(((evento: string, ouvinte: (e?: unknown) => void) => {
      ouvintes[evento] = ouvinte;
    }) as JitsiApi['addListener']);
    const Duble = function (this: unknown, dominio: string, opcoes: JitsiOpcoes) {
      criadas.push({ dominio, opcoes });
      return api;
    } as unknown as JitsiConstrutor;
    TestBed.configureTestingModule({
      providers: [{ provide: JITSI, useValue: () => Promise.resolve(Duble) }],
    });
  });

  const abrir = (quem: Participante, aoSair = () => undefined) =>
    TestBed.inject(VideochamadaService).abrir(
      document.createElement('div'),
      horario(7),
      quem,
      aoSair,
    );

  it('abre a sala do horário no elemento, com o nome de quem entra', async () => {
    const onde = document.createElement('div');
    await TestBed.inject(VideochamadaService).abrir(onde, horario(7), incubado, () => undefined);

    expect(criadas.length).toBe(1);
    expect(criadas[0].dominio).toBe('meet.jit.si');
    expect(criadas[0].opcoes.parentNode).toBe(onde);
    expect(criadas[0].opcoes.roomName).toBe(await nomeDaSala(horario(7)));
    expect(criadas[0].opcoes.userInfo).toEqual({ displayName: 'Ana', email: 'ana@x.com' });
  });

  it('avisa quando a pessoa desliga', async () => {
    const aoSair = jasmine.createSpy('aoSair');
    await abrir(incubado, aoSair);

    ouvintes['readyToClose']();
    expect(aoSair).toHaveBeenCalled();
  });

  it('o consultor liga a sala de espera quando vira moderador', async () => {
    await abrir(consultor);

    ouvintes['participantRoleChanged']({ id: 'x', role: 'participant' });
    expect(api.executeCommand).not.toHaveBeenCalled();

    ouvintes['participantRoleChanged']({ id: 'x', role: 'moderator' });
    expect(api.executeCommand).toHaveBeenCalledWith('toggleLobby', true);
  });

  it('o incubado bate na porta sozinho e não mexe na sala de espera', async () => {
    await abrir(incubado);

    expect(criadas[0].opcoes.configOverwrite?.['lobby']).toEqual({ autoKnock: true });
    expect(ouvintes['participantRoleChanged']).toBeUndefined();
  });

  it('o consultor não bate na porta', async () => {
    await abrir(consultor);

    expect(criadas[0].opcoes.configOverwrite?.['lobby']).toEqual({ autoKnock: false });
  });
});

describe('nomeDaSala', () => {
  it('é a mesma para os dois lados e muda com o horário', async () => {
    expect(await nomeDaSala(horario(7))).toBe(await nomeDaSala(horario(7)));
    expect(await nomeDaSala(horario(7))).not.toBe(await nomeDaSala(horario(8)));
  });

  it('não depende da reserva: o incubado recém-reservado cai na sala do consultor', async () => {
    expect(await nomeDaSala(horario(7, null))).toBe(await nomeDaSala(horario(7)));
  });

  it('não expõe o id nem os e-mails', async () => {
    const sala = await nomeDaSala(horario(7));
    expect(sala).toMatch(/^TecCampos-[0-9a-f]{24}$/);
    expect(sala).not.toContain('cons');
  });
});
