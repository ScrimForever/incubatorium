import { DOCUMENT, Injectable, InjectionToken, inject } from '@angular/core';

import { JITSI_DOMINIO } from '../constants/app-constants';
import { Horario } from '../models/consultoria';
import { JitsiApi, JitsiConstrutor } from '../models/videochamada';

/**
 * Carrega o `external_api.js` do servidor do Jitsi e entrega o construtor. O
 * script não existe no npm — vem do próprio servidor —, então entra uma vez,
 * na primeira chamada. Token para o spec trocar por um dublê.
 */
export const JITSI = new InjectionToken<() => Promise<JitsiConstrutor>>('JITSI', {
  providedIn: 'root',
  factory: () => {
    const documento = inject(DOCUMENT);
    let carregando: Promise<JitsiConstrutor> | null = null;
    return () =>
      (carregando ??= new Promise<JitsiConstrutor>((resolve, reject) => {
        const script = documento.createElement('script');
        script.src = `https://${JITSI_DOMINIO}/external_api.js`;
        script.async = true;
        script.onload = () => {
          const construtor = (window as unknown as { JitsiMeetExternalAPI?: JitsiConstrutor })
            .JitsiMeetExternalAPI;
          if (construtor) {
            resolve(construtor);
          } else {
            reject(new Error('script sem JitsiMeetExternalAPI'));
          }
        };
        script.onerror = () => {
          // Deixa tentar de novo: a falha costuma ser rede.
          carregando = null;
          script.remove();
          reject(new Error('falha ao carregar o script do Jitsi'));
        };
        documento.head.appendChild(script);
      }));
  },
});

/**
 * Quem entra na chamada. O consultor é o anfitrião: liga a sala de espera, e o
 * incubado (convidado) bate na porta e espera ser liberado.
 */
export interface Participante {
  readonly nome: string;
  readonly email: string;
  readonly papel: 'anfitriao' | 'convidado';
}

/**
 * Videochamada da consultoria, embutida pela IFrame API do Jitsi. A sala sai do
 * horário: os dois lados chegam na mesma sem o backend guardar link.
 */
@Injectable({ providedIn: 'root' })
export class VideochamadaService {
  private readonly carregar = inject(JITSI);

  /** Abre a chamada dentro de `onde`; `aoSair` roda quando a pessoa desliga. */
  async abrir(
    onde: HTMLElement,
    horario: Horario,
    participante: Participante,
    aoSair: () => void,
  ): Promise<JitsiApi> {
    const [Jitsi, sala] = await Promise.all([this.carregar(), nomeDaSala(horario)]);
    const api = new Jitsi(JITSI_DOMINIO, {
      roomName: sala,
      parentNode: onde,
      width: '100%',
      height: '100%',
      lang: 'ptBR',
      userInfo: { displayName: participante.nome, email: participante.email },
      configOverwrite: {
        prejoinConfig: { enabled: true },
        disableDeepLinking: true,
        lobby: { autoKnock: participante.papel === 'convidado' },
      },
    });
    api.addListener('readyToClose', aoSair);
    if (participante.papel === 'anfitriao') {
      // Só moderador liga a sala de espera, e o papel chega depois de entrar
      // (no meet.jit.si, depois do login no próprio Jitsi).
      api.addListener('participantRoleChanged', ({ role }) => {
        if (role === 'moderator') {
          api.executeCommand('toggleLobby', true);
        }
      });
    }
    return api;
  }
}

/**
 * Nome da sala: hash do horário e do consultor. No servidor público a sala é
 * aberta a quem souber o nome; com o hash, o id sozinho não basta para adivinhar.
 * O incubado fica de fora: logo depois de reservar, o horário dele ainda vem livre.
 */
export async function nomeDaSala(horario: Horario): Promise<string> {
  const base = `teccampos:${horario.id}:${horario.consultor_email}`;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base));
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `TecCampos-${hex.slice(0, 24)}`;
}
