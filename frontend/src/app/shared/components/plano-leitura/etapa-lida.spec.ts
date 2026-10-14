import { documentoVazio } from '../../../core/models/questionario';
import { mediaGeral, montarEtapaLida } from './etapa-lida';

describe('montarEtapaLida', () => {
  it('leva a avaliacao da aba para a leitura, no formato do documento', () => {
    const json = documentoVazio();
    json['3'].avaliacao = { avaliador: 'ana@teccampos.com', nota: 4, comentario: 'bom' };

    const etapa = montarEtapaLida(json, 3);

    expect(etapa.avaliacao).toEqual({
      avaliador: 'ana@teccampos.com',
      nota: 4,
      comentario: 'bom',
    });
    expect(etapa.media).toBe(4);
  });

  it('etapa sem avaliacao nao tem nota nenhuma', () => {
    const etapa = montarEtapaLida(documentoVazio(), 5);

    expect(etapa.avaliacao).toBeNull();
    expect(etapa.media).toBeNull();
  });

  /** Comentar sem pontuar e permitido; entrar na media baixaria a de quem pontuou. */
  it('quem so comentou nao entra na media', () => {
    const json = documentoVazio();
    json['7'].avaliacao = { avaliador: 'ana@teccampos.com', nota: null, comentario: 'revisar' };

    const etapa = montarEtapaLida(json, 7);

    expect(etapa.avaliacao?.comentario).toBe('revisar');
    expect(etapa.media).toBeNull();
    expect(mediaGeral([etapa])).toBeNull();
  });

  it('a media geral e a media das etapas pontuadas', () => {
    const json = documentoVazio();
    json['1'].avaliacao = { avaliador: 'a@x.com', nota: 5, comentario: '' };
    json['2'].avaliacao = { avaliador: 'a@x.com', nota: 2, comentario: '' };

    const etapas = [montarEtapaLida(json, 1), montarEtapaLida(json, 2), montarEtapaLida(json, 3)];

    expect(mediaGeral(etapas)).toBe(3.5);
  });
});
