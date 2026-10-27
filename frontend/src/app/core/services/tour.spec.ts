import { TestBed } from '@angular/core/testing';
import { Config, Driver } from 'driver.js';

import { DRIVER, PassoTour, TourService } from './tour';

describe('TourService', () => {
  let service: TourService;
  let configs: Config[];
  let drive: jasmine.Spy;
  let destroy: jasmine.Spy;
  const alvos: HTMLElement[] = [];

  const PASSOS: PassoTour[] = [
    { alvo: 'um', titulo: 'Um', texto: 'primeiro' },
    { alvo: 'ausente', titulo: 'Fora', texto: 'não está na tela' },
    { alvo: 'dois', titulo: 'Dois', texto: 'segundo' },
  ];

  function colocarNaTela(alvo: string): void {
    const el = document.createElement('div');
    el.dataset['tour'] = alvo;
    document.body.appendChild(el);
    alvos.push(el);
  }

  beforeEach(() => {
    configs = [];
    drive = jasmine.createSpy('drive');
    destroy = jasmine.createSpy('destroy');
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DRIVER,
          useValue: (config: Config) => {
            configs.push(config);
            return { drive, destroy } as unknown as Driver;
          },
        },
      ],
    });
    service = TestBed.inject(TourService);
    localStorage.removeItem('tour-visto:teste');
    colocarNaTela('um');
    colocarNaTela('dois');
  });

  afterEach(() => {
    alvos.splice(0).forEach((el) => el.remove());
    localStorage.removeItem('tour-visto:teste');
  });

  it('abre só com os passos que estão na tela, em português', () => {
    service.iniciar(PASSOS);

    expect(drive).toHaveBeenCalled();
    const config = configs[0];
    expect(config.steps?.map((passo) => passo.element)).toEqual([
      '[data-tour="um"]',
      '[data-tour="dois"]',
    ]);
    expect(config.nextBtnText).toBe('Próximo');
    expect(config.progressText).toBe('{{current}} de {{total}}');
  });

  it('só o × fecha no meio do tour: clique fora e Esc, não', () => {
    service.iniciar(PASSOS);
    const config = configs[0];
    const tour = {
      destroy: jasmine.createSpy('destroy'),
      hasNextStep: () => true,
    } as unknown as Driver;
    const opcoes = { driver: tour, config, state: {} } as never;

    expect(config.overlayClickBehavior).toBe('none');
    config.onDestroyStarted?.(undefined, {}, opcoes);
    expect(tour.destroy).not.toHaveBeenCalled();

    config.onCloseClick?.(undefined, {}, opcoes);
    expect(tour.destroy).toHaveBeenCalled();
  });

  it('o "Concluir" do último passo fecha', () => {
    service.iniciar(PASSOS);
    const tour = {
      destroy: jasmine.createSpy('destroy'),
      hasNextStep: () => false,
    } as unknown as Driver;
    configs[0].onDestroyStarted?.(undefined, {}, { driver: tour } as never);
    expect(tour.destroy).toHaveBeenCalled();
  });

  it('sem nenhum alvo na tela, não abre', () => {
    service.iniciar([{ alvo: 'ausente', titulo: '', texto: '' }]);
    expect(drive).not.toHaveBeenCalled();
  });

  it('na primeira visita abre e lembra; na segunda, não', () => {
    service.iniciarNaPrimeiraVisita('teste', PASSOS);
    service.iniciarNaPrimeiraVisita('teste', PASSOS);

    expect(drive).toHaveBeenCalledTimes(1);
    expect(service.jaViu('teste')).toBeTrue();
  });

  it('o botão reabre mesmo depois de visto', () => {
    service.iniciarNaPrimeiraVisita('teste', PASSOS);
    service.iniciar(PASSOS);
    expect(drive).toHaveBeenCalledTimes(2);
  });

  it('encerrar fecha o tour aberto', () => {
    service.iniciar(PASSOS);
    service.encerrar();
    expect(destroy).toHaveBeenCalled();
  });
});
