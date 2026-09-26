import { pareceJwt } from './token-store';

describe('pareceJwt', () => {
  it('aceita o formato de tres partes base64url', () => {
    expect(pareceJwt('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.aBc-_123')).toBeTrue();
  });

  it('recusa endereco comum, que deve virar pagina nao encontrada', () => {
    expect(pareceJwt('dashboard')).toBeFalse();
    expect(pareceJwt('minha.conta')).toBeFalse();
    expect(pareceJwt('')).toBeFalse();
  });

  it('recusa caractere que nao existe em base64url', () => {
    expect(pareceJwt('abc.d+f.ghi')).toBeFalse();
    expect(pareceJwt('abc.d/f.ghi')).toBeFalse();
  });
});
