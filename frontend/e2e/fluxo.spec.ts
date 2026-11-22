import { expect, test } from '@playwright/test';

import { entrar, entrarComo } from './contas';
import {
  Massa,
  SENHA,
  apagarMassa,
  comNoveNotas,
  criarMassa,
  gravarPlano,
  plano,
  planoCompleto,
} from './massa';

/** O fluxo inteiro do plano, com contas e plano criados pela API para esta spec. */
test.describe.configure({ mode: 'serial' });

let massa: Massa;

test.beforeAll(async ({ request }) => {
  massa = await criarMassa(request);
});

test.afterAll(async ({ request }) => {
  await apagarMassa(request, massa);
});

test('consultor designado dá nota numa etapa e depois edita', async ({ page, request }) => {
  await entrarComo(page, massa.consultor, SENHA);
  await page.goto(`/planos-de-negocio/${massa.incubado}`);
  await page.getByRole('button', { name: '2. Canvas' }).click();
  await page.locator('.aval-valor.nota-4').click();

  const gravou = page.waitForResponse(
    (r) => /\/api\/questionario\/\d+$/.test(r.url()) && r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Salvar avaliação' }).click();
  expect((await gravou).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Editar avaliação' })).toBeVisible();

  const salvo = await plano(request, massa.incubado);
  const etapa2 = salvo.json_questionario['2'] as { avaliacao: { nota: number; avaliador: string } };
  expect(etapa2.avaliacao).toMatchObject({ nota: 4, avaliador: massa.consultor });
  expect(salvo.status_questionario).toBe('aguardando_aprovacao');
});

test('consultor pede ajuste: plano volta a pendente e o incubado vê o alerta', async ({
  page,
  request,
}) => {
  await entrarComo(page, massa.consultor, SENHA);
  await page.goto(`/planos-de-negocio/${massa.incubado}`);
  await page.getByRole('button', { name: '3. Sumário' }).click();
  await page.getByRole('button', { name: 'Solicitar ajuste nesta etapa' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('O que corrigir').fill('Detalhe o público-alvo.');
  await modal.getByRole('button', { name: 'Enviar para o incubado' }).click();
  const gravou = page.waitForResponse(
    (r) => /\/api\/questionario\/\d+$/.test(r.url()) && r.request().method() === 'PUT',
  );
  await modal.getByRole('button', { name: 'Confirmar envio' }).click();
  expect((await gravou).status()).toBe(200);
  expect((await plano(request, massa.incubado)).status_questionario).toBe('pendente');

  await entrarComo(page, massa.incubado, SENHA);
  await page.getByRole('button', { name: '3. Sumário' }).click();
  await expect(page.getByText('Ajuste pedido nesta etapa: Detalhe o público-alvo.')).toBeVisible();
});

test('coordenação aprova com as nove notas e o incubado vê o plano aprovado', async ({
  page,
  request,
}) => {
  await gravarPlano(
    request,
    massa.planoId,
    'aguardando_aprovacao',
    comNoveNotas(planoCompleto('Negócio aprovado PW'), massa.consultor),
  );
  await entrar(page, 'admin');
  await page.goto(`/planos-de-negocio/${massa.incubado}`);
  const aprovar = page.getByRole('button', { name: 'Aprovar', exact: true });
  await expect(aprovar).toBeEnabled();
  await aprovar.click();
  const gravou = page.waitForResponse(
    (r) => /\/api\/questionario\/\d+$/.test(r.url()) && r.request().method() === 'PUT',
  );
  await page
    .getByRole('alertdialog', { name: 'Aprovar plano' })
    .getByRole('button', { name: 'Aprovar plano' })
    .click();
  expect((await gravou).status()).toBe(200);
  expect((await plano(request, massa.incubado)).status_questionario).toBe('aprovado');

  await entrarComo(page, massa.incubado, SENHA);
  await page.goto('/meu-plano');
  await expect(page.getByRole('heading', { name: 'Meu plano' })).toBeVisible();
  await expect(page.getByText('Negócio aprovado PW').first()).toBeVisible();
});

test('plano devolvido: o incubado vê o motivo', async ({ page, request }) => {
  const json = planoCompleto('Negócio devolvido PW');
  json['decisao'] = {
    status: 'rejeitado',
    justificativa: 'Falta o plano financeiro.',
    por: 'admin.status@teccampos.com',
    em: new Date().toISOString(),
  };
  await gravarPlano(request, massa.planoId, 'rejeitado', json);
  await entrarComo(page, massa.incubado, SENHA);
  await expect(page).toHaveURL(/\/plano-rejeitado$/);
  await expect(page.getByText('Falta o plano financeiro.')).toBeVisible();
});

test('coordenação reabre o plano devolvido: volta a pendente e o motivo segue à vista', async ({
  page,
  request,
}) => {
  await entrar(page, 'admin');
  await page.goto(`/planos-de-negocio/${massa.incubado}`);
  await page.getByRole('button', { name: 'Reabrir para edição' }).click();
  const gravou = page.waitForResponse(
    (r) => /\/api\/questionario\/\d+$/.test(r.url()) && r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Reabrir plano' }).click();
  expect((await gravou).status()).toBe(200);
  expect((await plano(request, massa.incubado)).status_questionario).toBe('pendente');

  await entrarComo(page, massa.incubado, SENHA);
  await expect(page).toHaveURL(/\/questionario$/);
  await expect(page.getByText('Falta o plano financeiro.')).toBeVisible();
});

test('coordenação só lê as respostas do incubado (travadas desde 13/11)', async ({
  page,
  request,
}) => {
  await gravarPlano(request, massa.planoId, 'aguardando_aprovacao', planoCompleto('Antes PW'));
  await entrar(page, 'admin');
  await page.goto(`/planos-de-negocio/${massa.incubado}`);
  await expect(page.locator('#nome_negocio')).not.toBeEditable();
  const puts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PUT') puts.push(r.url());
  });
  await page.getByRole('button', { name: '2. Canvas' }).click();
  await expect(page.locator('[aria-current="step"]', { hasText: 'Canvas' })).toBeVisible();
  expect(puts).toEqual([]);
});
