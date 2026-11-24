import { expect, test } from '@playwright/test';

import { entrar, entrarComo } from './contas';
import {
  Massa,
  SENHA,
  apagarConta,
  apagarMassa,
  criarConta,
  criarMassa,
  gravarPlano,
  plano,
  planoCompleto,
} from './massa';

/**
 * Lista e decisão de planos com massa própria: um incubado com plano em análise e
 * um consultor designado, criados pela API. Não depende de conta semeada no banco.
 */
test.describe.configure({ mode: 'serial' });

let massa: Massa;

test.beforeAll(async ({ request }) => {
  massa = await criarMassa(request);
});

test.afterAll(async ({ request }) => {
  await apagarMassa(request, massa);
});

/** Volta o plano da massa para análise, sem decisão, para cada teste partir do mesmo ponto. */
async function emAnalise(request: Parameters<typeof plano>[0]): Promise<void> {
  await gravarPlano(request, massa.planoId, 'aguardando_aprovacao', planoCompleto('Negócio PW'));
}

test('admin vê todos os planos com abas por situação', async ({ page }) => {
  await entrar(page, 'admin');
  await page.goto('/planos-de-negocio');
  const abas = [
    'Todos',
    'Não iniciado',
    'Em preenchimento',
    'Aguardando aprovação',
    'Aprovado',
    'Devolvido',
  ];
  for (const aba of abas) {
    await expect(page.getByRole('button', { name: aba, exact: true })).toBeVisible();
  }
  await expect(page.getByText(/^1–\d+ de \d+$/)).toBeVisible();
});

test('consultor só recebe os planos designados a ele', async ({ page }) => {
  const todos = page.waitForResponse((r) => r.url().endsWith('/api/questionario/todos'));
  await entrarComo(page, massa.consultor, SENHA);
  const planos = (await (await todos).json()) as { usuario_email: string }[];
  expect(planos.map((p) => p.usuario_email)).toEqual([massa.incubado]);
});

test('consultor abre o plano designado com a própria nota', async ({ page, request }) => {
  const json = planoCompleto('Negócio PW');
  json['2'] = {
    ...(json['2'] as Record<string, unknown>),
    avaliacao: {
      nota: 3,
      avaliador: massa.consultor,
      comentario: '<p>Observação e2e do consultor</p>',
    },
  };
  await gravarPlano(request, massa.planoId, 'aguardando_aprovacao', json);
  await entrarComo(page, massa.consultor, SENHA);
  await page.goto(`/planos-de-negocio/${massa.incubado}`);
  await expect(page.getByRole('heading', { name: 'Plano de negócios' })).toBeVisible();
  await page.getByRole('button', { name: '2. Canvas' }).click();
  await expect(page.getByText('Observação e2e do consultor')).toBeVisible();
});

test('coordenação devolve plano em análise com motivo, sem precisar de nota', async ({
  page,
  request,
}) => {
  await emAnalise(request);
  await entrar(page, 'admin');
  await page.goto(`/planos-de-negocio/${massa.incubado}`);
  await page.getByRole('button', { name: 'Devolver', exact: true }).click();

  const modal = page.getByRole('dialog', { name: 'Devolver plano' });
  const confirmar = modal.getByRole('button', { name: 'Devolver plano' });
  await expect(confirmar).toBeDisabled();
  await modal.getByLabel('Motivo da devolução').fill('Falta o plano financeiro.');

  const gravou = page.waitForResponse(
    (r) => /\/api\/questionario\/\d+$/.test(r.url()) && r.request().method() === 'PUT',
  );
  await confirmar.click();
  const resposta = await gravou;
  expect(resposta.status()).toBe(200);
  const corpo = resposta.request().postDataJSON() as {
    status_questionario: string;
    json_questionario: { decisao: { justificativa: string } };
  };
  expect(corpo.status_questionario).toBe('rejeitado');
  expect(corpo.json_questionario.decisao.justificativa).toBe('Falta o plano financeiro.');
  await expect(page.getByText('Plano devolvido ao incubado.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reabrir para edição' })).toBeVisible();
});

test('consultor não vê abas de situação; admin não vê plano de quem não é incubado', async ({
  page,
}) => {
  await entrarComo(page, massa.consultor, SENHA);
  await expect(page.getByRole('group', { name: 'Filtrar por situação' })).toHaveCount(0);

  await entrar(page, 'admin');
  await page.goto('/planos-de-negocio');
  await page.getByPlaceholder('Buscar por negócio, proponente ou e-mail').fill(massa.consultor);
  await expect(page.getByText('Nenhum plano', { exact: false })).toBeVisible();
});

test('designar não muda o status; o consultor designado avalia e pode pedir ajuste', async ({
  page,
  request,
}) => {
  await emAnalise(request);
  const outro = await criarConta(request, 'consultor');
  try {
    await entrar(page, 'admin');
    await page.goto(`/planos-de-negocio/${massa.incubado}`);
    await expect(page.getByRole('button', { name: 'Aprovar', exact: true })).toBeDisabled();

    await page.getByRole('button', { name: 'Enviar para avaliação' }).click();
    const modal = page.getByRole('dialog');
    await modal.getByText(outro.email).click();
    await modal.getByRole('button', { name: 'Enviar para avaliação' }).click();
    const designou = page.waitForResponse((r) =>
      r.url().endsWith('/api/questionario-selecionado-avaliadores'),
    );
    const gravouPlano: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'PUT') gravouPlano.push(r.url());
    });
    await modal.getByRole('button', { name: 'Confirmar envio' }).click();
    expect((await designou).status()).toBe(201);
    await expect(page.getByText('Avaliadores designados.', { exact: false })).toBeVisible();
    await expect(page.getByText('Aguardando aprovação').first()).toBeVisible();
    expect(gravouPlano).toEqual([]);
    expect((await plano(request, massa.incubado)).status_questionario).toBe('aguardando_aprovacao');

    await entrarComo(page, outro.email, SENHA);
    await page.goto(`/planos-de-negocio/${massa.incubado}`);
    await page.getByRole('button', { name: '2. Canvas' }).click();
    await expect(page.getByRole('button', { name: 'Solicitar ajuste nesta etapa' })).toBeVisible();
  } finally {
    await apagarConta(request, outro.id);
  }
});

test.describe('incubado com conta nova', () => {
  let conta: { email: string; id: string };

  test.beforeEach(async ({ request }) => {
    conta = await criarConta(request, 'incubado');
  });

  test.afterEach(async ({ request }) => {
    await apagarConta(request, conta?.id);
  });

  test('salva o rascunho da etapa 1 no servidor', async ({ page }) => {
    await entrarComo(page, conta.email, SENHA);
    await page.getByPlaceholder('Insira o nome do proponente').fill('Teste UI');
    await page.getByPlaceholder('Insira o nome do negócio').fill('Negocio E2E');
    await page.getByPlaceholder('Insira o setor de atuação').fill('Tecnologia');
    const salvou = page.waitForResponse(
      (r) => r.url().endsWith('/api/questionario') && r.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Salvar rascunho' }).click();
    const corpo = (await (await salvou).json()) as {
      json_questionario: Record<string, Record<string, string>>;
    };
    expect(corpo.json_questionario['1'].nome_negocio).toBe('Negocio E2E');
  });

  test('CNPJ inválido e etapa vazia não gravam', async ({ page }) => {
    await entrarComo(page, conta.email, SENHA);
    const puts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'PUT') puts.push(r.url());
    });
    await page.getByPlaceholder('00.000.000/0000-00').fill('123');
    await page.getByRole('button', { name: 'Próximo' }).click();
    await expect(page.getByText('CNPJ inválido', { exact: false })).toBeVisible();
    await expect(page.getByText('Preencha esta etapa antes de avançar.').first()).toBeVisible();
    expect(puts).toEqual([]);
  });
});
