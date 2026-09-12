import { APP_ROUTES } from '../constants/app-constants';
import { StatusQuestionario } from '../models/questionario';
import { destinoPara } from './plano-guard';

/**
 * A tabela do onboarding, verificada status a status: mexer no roteamento sem
 * querer quebra aqui primeiro.
 */
describe('destinoPara', () => {
  it('iniciado e pendente ficam no questionário', () => {
    expect(destinoPara('iniciado', 'incubado')).toBe(APP_ROUTES.questionario);
    expect(destinoPara('pendente', 'incubado')).toBe(APP_ROUTES.questionario);
  });

  it('enviado vai para a tela de espera, não para o painel', () => {
    expect(destinoPara('aguardando_aprovacao', 'incubado')).toBe(APP_ROUTES.aguardandoAprovacao);
  });

  it('rejeitado tem tela própria', () => {
    expect(destinoPara('rejeitado', 'incubado')).toBe(APP_ROUTES.planoRejeitado);
  });

  it('só o aprovado abre o painel, no papel de quem entrou', () => {
    expect(destinoPara('aprovado', 'incubado')).toBe('/dashboard/incubado');
    expect(destinoPara('aprovado', 'admin')).toBe('/dashboard/admin');
  });

  it('nenhum status leva ao painel antes da aprovação', () => {
    const antesDeAprovar: StatusQuestionario[] = [
      'iniciado',
      'pendente',
      'aguardando_aprovacao',
      'rejeitado',
    ];
    for (const status of antesDeAprovar) {
      expect(destinoPara(status, 'incubado')).not.toContain('/dashboard');
    }
  });

  it('cada status tem um destino, e nenhum se repete indevidamente', () => {
    const todos: StatusQuestionario[] = [
      'iniciado',
      'pendente',
      'aguardando_aprovacao',
      'aprovado',
      'rejeitado',
    ];
    const destinos = todos.map((status) => destinoPara(status, 'incubado'));
    expect(destinos.every((destino) => destino.startsWith('/'))).toBeTrue();
    // iniciado e pendente dividem o questionário de propósito: são 4 destinos.
    expect(new Set(destinos).size).toBe(4);
  });
});
