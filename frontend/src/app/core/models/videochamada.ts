/**
 * O pedaço da IFrame API do Jitsi (`external_api.js`) que o sistema usa. O
 * Jitsi não publica tipos; estes seguem o handbook (dev-guide-iframe).
 */

export interface JitsiOpcoes {
  roomName: string;
  parentNode: HTMLElement;
  width?: string | number;
  height?: string | number;
  lang?: string;
  userInfo?: { displayName?: string; email?: string };
  configOverwrite?: Record<string, unknown>;
  interfaceConfigOverwrite?: Record<string, unknown>;
}

/** Payload do `participantRoleChanged`: o papel novo de quem está nesta aba. */
export interface JitsiPapelMudou {
  id: string;
  role: string;
}

export interface JitsiApi {
  addListener(evento: 'readyToClose', ouvinte: () => void): void;
  addListener(evento: 'participantRoleChanged', ouvinte: (e: JitsiPapelMudou) => void): void;
  executeCommand(comando: 'hangup'): void;
  executeCommand(comando: 'toggleLobby', ligado: boolean): void;
  dispose(): void;
}

export type JitsiConstrutor = new (dominio: string, opcoes: JitsiOpcoes) => JitsiApi;
