import { Page, expect, test } from '@playwright/test';

import { entrar } from './contas';
import { apagarConta, criarConta as criarContaApi } from './massa';

const criarConta = (page: Page) =>
  page.waitForResponse((r) => r.url().endsWith('/api/usuarios') && r.request().method() === 'POST');

async function preencherNovo(page: Page, email: string): Promise<void> {
  await page.getByRole('button', { name: 'Novo usuário' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Nome', { exact: true }).fill('Playwright');
  await modal.getByLabel('Sobrenome').fill('E2E');
  await modal.getByPlaceholder('(##) #####-####').fill('22999990000');
  await modal.getByLabel('E-mail').fill(email);
  await modal.getByLabel('Senha', { exact: true }).fill('12345678');
  await modal.locator('input[value=incubado]').check({ force: true });
}

test.beforeEach(async ({ page }) => {
  await entrar(page, 'admin');
  await page.goto('/usuarios');
  await expect(page.getByRole('heading', { name: 'Usuários' })).toBeVisible();
});

test('lista real, paginada de 10 em 10', async ({ page, request }) => {
  // Garante mais de uma página, seja qual for o banco: 11 contas próprias.
  const criadas: { id: string }[] = [];
  for (let i = 0; i < 11; i++) criadas.push(await criarContaApi(request, 'incubado'));
  try {
    await page.reload();
    await expect(page.getByRole('button', { name: /^Ver conta de/ })).toHaveCount(10);
    await expect(page.getByText(/^1–10 de \d+$/)).toBeVisible();
  } finally {
    for (const c of criadas) await apagarConta(request, c.id);
  }
});

test('cria incubado pela modal e ele aparece na lista', async ({ page }) => {
  const email = `pw.${Date.now()}@teccampos.com`;
  await preencherNovo(page, email);
  const resposta = criarConta(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Criar conta' }).click();
  expect((await resposta).status()).toBe(201);
  await expect(page.getByText(email)).toBeVisible();
});

test('e-mail repetido não cria conta', async ({ page }) => {
  await preencherNovo(page, 'admin.status@teccampos.com');
  const resposta = criarConta(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Criar conta' }).click();
  expect((await resposta).status()).toBe(409);
  await expect(page.getByRole('dialog')).toBeVisible();
});

async function criarPelaTela(page: Page): Promise<string> {
  const email = `pw.${Date.now()}@teccampos.com`;
  await preencherNovo(page, email);
  const resposta = criarConta(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Criar conta' }).click();
  expect((await resposta).status()).toBe(201);
  return email;
}

async function abrirConta(page: Page, email: string): Promise<void> {
  await page.getByPlaceholder('Buscar por nome ou e-mail').fill(email);
  await page.getByRole('button', { name: 'Ver conta de Playwright E2E' }).click();
  await expect(page.getByRole('dialog', { name: 'Editar usuário' })).toBeVisible();
}

test('exclui a conta: a confirmação fica por cima e o DELETE vai para /users/{id}', async ({
  page,
}) => {
  const email = await criarPelaTela(page);
  await abrirConta(page, email);
  await page.getByRole('button', { name: 'Excluir conta' }).click();

  const apagou = page.waitForResponse(
    (r) => r.url().includes('/api/users/') && r.request().method() === 'DELETE',
  );
  await page
    .getByRole('dialog', { name: 'Excluir conta' })
    .getByRole('button', { name: 'Excluir conta' })
    .click();
  expect((await apagou).status()).toBe(204);
  await expect(page.getByText('Usuário excluído.')).toBeVisible();
  await expect(page.getByText(email)).toHaveCount(0);
});

test('troca o papel e desativa a conta, mandando só o que mudou', async ({ page }) => {
  const email = await criarPelaTela(page);
  await abrirConta(page, email);
  const modal = page.getByRole('dialog', { name: 'Editar usuário' });
  await modal.locator('input[value=colaborador]').check({ force: true });
  await modal.getByLabel(/Conta ativa/).uncheck();

  const salvou = page.waitForResponse(
    (r) => r.url().includes('/api/usuarios/') && r.request().method() === 'PATCH',
  );
  await modal.getByRole('button', { name: 'Salvar alterações' }).click();
  const resposta = await salvou;
  expect(resposta.status()).toBe(200);
  expect(resposta.request().postDataJSON()).toEqual({
    is_active: false,
    is_admin: false,
    is_colaborador: true,
    is_consultor: false,
    is_incubado: false,
  });
  const lista = page.locator('.lista-item', { hasText: email });
  await expect(lista.getByText('Colaborador')).toBeVisible();
});

test('telefone abre formatado na edição e não conta como mudança', async ({ page }) => {
  const email = await criarPelaTela(page);
  await abrirConta(page, email);
  const modal = page.getByRole('dialog', { name: 'Editar usuário' });
  await expect(modal.getByPlaceholder('(##) #####-####')).toHaveValue('(22) 99999-0000');
  await modal.getByLabel('Sobrenome').fill('E2E Editado');
  const salvou = page.waitForResponse(
    (r) => r.url().includes('/api/usuarios/') && r.request().method() === 'PATCH',
  );
  await modal.getByRole('button', { name: 'Salvar alterações' }).click();
  expect((await salvou).request().postDataJSON()).toEqual({ sobrenome: 'E2E Editado' });
});
