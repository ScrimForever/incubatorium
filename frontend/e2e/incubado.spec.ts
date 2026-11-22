import { Page, expect, test } from '@playwright/test';

import { entrarComo } from './contas';
import { SENHA, apagarConta, criarConta, plano } from './massa';

/**
 * O incubado preenche as nove etapas pela tela, com anexos de verdade, e envia.
 * Conta nova, criada pela API: o plano nasce `iniciado`.
 */
test.describe.configure({ mode: 'serial' });

let conta: { email: string; id: string };

test.beforeAll(async ({ request }) => {
  conta = await criarConta(request, 'incubado');
});

test.afterAll(async ({ request }) => {
  await apagarConta(request, conta?.id);
});

const PDF = {
  name: 'mercado.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
};
const CSV = {
  name: 'financeiro.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from('mes;receita\njan;100\n'),
};

async function preencherEditores(page: Page, texto: string): Promise<void> {
  const editores = page.locator('.quest-cartao .ql-editor');
  await editores.first().waitFor();
  const total = await editores.count();
  for (let i = 0; i < total; i++) {
    await editores.nth(i).click();
    await page.keyboard.type(`${texto} ${i + 1}`);
  }
}

async function proximo(page: Page, etapa: string): Promise<void> {
  await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(page.locator('[aria-current="step"]', { hasText: etapa })).toBeVisible();
}

test('preenche as nove etapas, anexa, baixa e apaga arquivo, e envia para análise', async ({
  page,
  request,
}) => {
  await entrarComo(page, conta.email, SENHA);
  await expect(page).toHaveURL(/\/questionario$/);

  // 1 — negócio
  await page.getByPlaceholder('Insira o nome do proponente').fill('Proponente PW');
  await page.getByPlaceholder('Insira o nome do negócio').fill('Negócio Completo PW');
  await page.getByPlaceholder('Insira o setor de atuação').fill('Tecnologia');
  await page.getByPlaceholder('00.000.000/0000-00').fill('11222333000181');
  await proximo(page, 'Canvas');

  // 2 e 3 — texto longo
  await preencherEditores(page, 'Canvas');
  await proximo(page, 'Sumário');
  await preencherEditores(page, 'Sumário');
  await proximo(page, 'Equipe');

  // 4 — equipe: sem membro não avança
  await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(page.getByText('Preencha esta etapa antes de avançar.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar membro' }).click();
  const membro = page.getByRole('dialog');
  await membro.getByPlaceholder('Ex.: João Paulo Ferreira').fill('Membro PW');
  await membro.getByPlaceholder('Ex.: Engenharia de Produção').fill('Engenharia');
  await membro.getByPlaceholder('Ex.: joao.ferreira@teccampos.com').fill('membro.pw@teccampos.com');
  await membro.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByText('Membro PW')).toBeVisible();
  await proximo(page, 'Produto');

  await preencherEditores(page, 'Produto');
  await proximo(page, 'Mercado');

  // 6 — mercado, com anexo: envia, baixa e apaga
  await preencherEditores(page, 'Mercado');
  const enviou = page.waitForResponse(
    (r) =>
      r.url().includes('/api/') &&
      r.request().method() === 'POST' &&
      /arquivo|upload|\/6/.test(r.url()),
  );
  await page.locator('#anexo-mercado').setInputFiles(PDF);
  expect((await enviou).status()).toBeLessThan(300);
  await page.getByRole('button', { name: 'Pré-visualizar mercado.pdf' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar' }).click();
  expect((await download).suggestedFilename()).toBe('mercado.pdf');
  await page.getByRole('button', { name: 'Fechar' }).last().click();

  await page.getByRole('button', { name: 'Remover mercado.pdf' }).click();
  const apagou = page.waitForResponse((r) => r.request().method() === 'DELETE');
  await page.getByRole('button', { name: 'Remover', exact: true }).click();
  expect((await apagou).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Pré-visualizar mercado.pdf' })).toHaveCount(0);

  // Sem anexo não avança; com ele, sim.
  await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(page.getByText('Anexe o arquivo da análise de mercado.')).toBeVisible();
  await page.locator('#anexo-mercado').setInputFiles(PDF);
  await expect(page.getByRole('button', { name: 'Pré-visualizar mercado.pdf' })).toBeVisible();
  await proximo(page, 'Marketing');

  await preencherEditores(page, 'Marketing');
  await proximo(page, 'Estrutura');
  await preencherEditores(page, 'Estrutura');
  await proximo(page, 'Financeiro');

  // 9 — planilha e envio
  await page.locator('#anexo-planilhas').setInputFiles(CSV);
  await expect(page.getByRole('button', { name: 'Pré-visualizar financeiro.csv' })).toBeVisible();
  await page.getByRole('button', { name: 'Enviar para análise' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Enviar para análise' }).click();
  await expect(page).toHaveURL(/\/aguardando-aprovacao$/);

  const salvo = await plano(request, conta.email);
  expect(salvo.status_questionario).toBe('aguardando_aprovacao');
  const json = salvo.json_questionario as Record<string, Record<string, unknown>>;
  expect(json['1'].cnpj).toBe('11.222.333/0001-81');
  expect((json['4'].equipe as unknown[]).length).toBe(1);
  expect((json['6'].arquivos as { nome: string }[]).map((a) => a.nome)).toEqual(['mercado.pdf']);
  expect((json['9'].arquivos as { nome: string }[]).map((a) => a.nome)).toEqual(['financeiro.csv']);
});
