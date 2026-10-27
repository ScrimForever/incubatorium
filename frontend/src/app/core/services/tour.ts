import { Injectable, InjectionToken, inject } from '@angular/core';
import { Config, Driver, driver } from 'driver.js';

/** Um passo do tour: o alvo é o valor do atributo `data-tour` na tela. */
export interface PassoTour {
  readonly alvo: string;
  readonly titulo: string;
  readonly texto: string;
}

/** A fábrica do Driver.js — um token para o spec trocar a biblioteca por um dublê. */
export const DRIVER = new InjectionToken<(config: Config) => Driver>('DRIVER', {
  providedIn: 'root',
  factory: () => driver,
});

/** Prefixo da chave no localStorage: "já vi o tour desta tela". */
const PREFIXO_VISTO = 'tour-visto:';

/**
 * Tour guiado (Driver.js). As telas só entregam os passos; textos de botão,
 * tema e a regra da primeira visita ficam aqui. O alvo é `[data-tour="…"]`,
 * e não classe de estilo, para uma mudança de layout não quebrar o tour.
 */
@Injectable({ providedIn: 'root' })
export class TourService {
  private readonly criar = inject(DRIVER);
  private ativo: Driver | null = null;

  /** Abre o tour. Passos cujo alvo não está na tela agora são pulados. */
  iniciar(passos: readonly PassoTour[]): void {
    const visiveis = passos.filter((passo) => document.querySelector(seletor(passo.alvo)));
    if (!visiveis.length) {
      return;
    }
    this.ativo?.destroy();
    this.ativo = this.criar({
      showProgress: true,
      progressText: '{{current}} de {{total}}',
      nextBtnText: 'Próximo',
      prevBtnText: 'Anterior',
      doneBtnText: 'Concluir',
      popoverClass: 'tour',
      stagePadding: 6,
      stageRadius: 10,
      overlayOpacity: 0.55,
      steps: visiveis.map((passo) => ({
        element: seletor(passo.alvo),
        popover: { title: passo.titulo, description: passo.texto },
      })),
      // Fecha só pelo ×, ou pelo "Concluir" do último passo: clique fora e Esc
      // largavam o tour no meio sem querer. As setas do teclado seguem navegando.
      overlayClickBehavior: 'none',
      onCloseClick: (_el, _passo, { driver: tour }) => tour.destroy(),
      onDestroyStarted: (_el, _passo, { driver: tour }) => {
        if (!tour.hasNextStep()) {
          tour.destroy();
        }
      },
      onDestroyed: () => (this.ativo = null),
    });
    this.ativo.drive();
  }

  /** Abre o tour só na primeira vez que esta tela é vista neste navegador. */
  iniciarNaPrimeiraVisita(tela: string, passos: readonly PassoTour[]): void {
    if (this.jaViu(tela)) {
      return;
    }
    this.marcarVisto(tela);
    this.iniciar(passos);
  }

  /** Fecha o tour aberto — a tela chama ao sair, para o véu não ficar no ar. */
  encerrar(): void {
    this.ativo?.destroy();
  }

  jaViu(tela: string): boolean {
    try {
      return localStorage.getItem(PREFIXO_VISTO + tela) === '1';
    } catch {
      // Sem localStorage (aba privada bloqueada): melhor não abrir sozinho.
      return true;
    }
  }

  private marcarVisto(tela: string): void {
    try {
      localStorage.setItem(PREFIXO_VISTO + tela, '1');
    } catch {
      // Sem onde guardar, o tour só não lembra; o botão continua abrindo.
    }
  }
}

function seletor(alvo: string): string {
  return `[data-tour="${alvo}"]`;
}
