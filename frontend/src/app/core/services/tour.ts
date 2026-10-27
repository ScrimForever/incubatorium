import { ApplicationRef, Injectable, InjectionToken, inject } from '@angular/core';
import { Config, Driver, DriverHook, driver } from 'driver.js';

/** Um passo do tour: o alvo é o valor do atributo `data-tour` na tela. */
export interface PassoTour {
  readonly alvo: string;
  readonly titulo: string;
  readonly texto: string;
  /**
   * Muda a tela antes de o passo aparecer (ex.: trocar de visão). O alvo só
   * existe depois disso, então o passo não é conferido na abertura do tour.
   */
  readonly antes?: () => void;
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
  private readonly app = inject(ApplicationRef);
  private ativo: Driver | null = null;

  /** Abre o tour. Passos cujo alvo não está na tela agora são pulados. */
  iniciar(passos: readonly PassoTour[]): void {
    // O primeiro passo arruma a tela antes da conferência: o que ele mostra conta,
    // e só existe depois de o Angular desenhar.
    const antes = passos[0]?.antes;
    if (antes) {
      antes();
      this.depoisDeDesenhar(() => this.abrir(passos));
      return;
    }
    this.abrir(passos);
  }

  private abrir(passos: readonly PassoTour[]): void {
    const visiveis = passos.filter(
      (passo) => passo.antes || document.querySelector(seletor(passo.alvo)),
    );
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
      steps: visiveis.map((passo, i) => ({
        // Função, e não seletor: o alvo é procurado na hora, depois do antes.
        element: () => document.querySelector(seletor(passo.alvo)) as Element,
        popover: {
          title: passo.titulo,
          description: passo.texto,
          onNextClick: this.comAntes(visiveis[i + 1], (tour) => tour.moveNext()),
          onPrevClick: this.comAntes(visiveis[i - 1], (tour) => tour.movePrevious()),
        },
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

  /**
   * Clique de Próximo/Anterior: sem antes no passo de destino, só anda; com ele,
   * muda a tela e espera o Angular desenhar antes de andar.
   */
  private comAntes(
    destino: PassoTour | undefined,
    andar: (tour: Driver) => void,
  ): DriverHook | undefined {
    return (_el, _passo, { driver: tour }) => {
      if (!destino?.antes) {
        andar(tour);
        return;
      }
      destino.antes();
      this.depoisDeDesenhar(() => andar(tour));
    };
  }

  /**
   * O antes muda signals, e o alvo novo só existe depois do desenho: desenha já,
   * em vez de esperar — se nada mudou, não haveria próximo desenho para esperar.
   */
  private depoisDeDesenhar(fazer: () => void): void {
    this.app.tick();
    fazer();
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
