import { expect, test } from '@playwright/test';

import { entrar, entrarComo } from './contas';
import { API, SENHA, apagarConta, criarConta, tokenAdmin } from './massa';

/**
 * Prints dos defeitos do backend que aparecem na tela, para o relatório ao Scrim.
 * Fora da suíte normal: só roda com EVIDENCIAS=1.
 */
test.skip(!process.env['EVIDENCIAS'], 'só para gerar evidências');

const PASTA = 'docs/evidencias-scrim/prints';

test('B7: admin criado pela tela recebe 403 ao excluir', async ({ page, request }) => {
  const headers = await tokenAdmin(request);
  const email = `pw.ev.admin.${Date.now()}@teccampos.com`;
  const r = await request.post(`${API}/usuarios`, {
    headers,
    data: {
      email,
      password: SENHA,
      nome: 'Admin',
      sobrenome: 'Novo',
      telefone: '22999990000',
      is_admin: true,
    },
  });
  const admin = (await r.json()) as { id: string };
  const alvo = await criarConta(request, 'incubado');

  await entrar(page, 'admin');
  await page.goto('/usuarios');
  await page.getByPlaceholder('Buscar por nome ou e-mail').fill(alvo.email);
  await page.getByRole('button', { name: /^Ver conta de/ }).click();

  await entrarComo(page, email, SENHA);
  await page.goto('/usuarios');
  await page.getByPlaceholder('Buscar por nome ou e-mail').fill(alvo.email);
  await page.getByRole('button', { name: /^Ver conta de/ }).click();
  await page.getByRole('button', { name: 'Excluir conta' }).click();
  const apagou = page.waitForResponse((x) => x.request().method() === 'DELETE');
  await page
    .getByRole('dialog', { name: 'Excluir conta' })
    .getByRole('button', { name: 'Excluir conta' })
    .click();
  expect((await apagou).status()).toBe(403);
  const erro = page.getByRole('dialog', { name: 'Editar usuário' }).getByRole('alert');
  await expect(erro).toBeVisible();
  await erro.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${PASTA}/B7-admin-novo-recebe-403.png` });

  await apagarConta(request, alvo.id);
  await apagarConta(request, admin.id);
});

test('Usuários: excluir conta pela tela (admin superuser)', async ({ page, request }) => {
  const alvo = await criarConta(request, 'incubado');
  await entrar(page, 'admin');
  await page.goto('/usuarios');
  await page.getByPlaceholder('Buscar por nome ou e-mail').fill(alvo.email);
  await page.getByRole('button', { name: /^Ver conta de/ }).click();
  await page.screenshot({ path: `${PASTA}/excluir-1-painel-da-conta.png` });
  await page.getByRole('button', { name: 'Excluir conta' }).click();
  const confirma = page.getByRole('dialog', { name: 'Excluir conta' });
  await expect(confirma).toBeVisible();
  await page.screenshot({ path: `${PASTA}/excluir-2-confirmacao.png` });
  const apagou = page.waitForResponse((x) => x.request().method() === 'DELETE');
  await confirma.getByRole('button', { name: 'Excluir conta' }).click();
  const r = await apagou;
  expect(r.status()).toBe(204);
  console.log(`DELETE ${r.url()} → ${r.status()} (${alvo.email}, id ${alvo.id})`);
  await expect(page.getByText('Usuário excluído.')).toBeVisible();
  await page.screenshot({ path: `${PASTA}/excluir-3-excluido.png` });
  await page.getByPlaceholder('Buscar por nome ou e-mail').fill(alvo.email);
  await expect(page.getByRole('button', { name: /^Ver conta de/ })).toHaveCount(0);
  await page.screenshot({ path: `${PASTA}/excluir-4-busca-vazia.png` });
});

test('B14: conta inativa recebe a mesma mensagem de senha errada', async ({ page, request }) => {
  const conta = await criarConta(request, 'incubado');
  const headers = await tokenAdmin(request);
  await request.patch(`${API}/usuarios/${encodeURIComponent(conta.email)}`, {
    headers,
    data: { is_active: false },
  });
  await page.goto('/login');
  await page.getByPlaceholder('seu@email.com').fill(conta.email);
  await page.getByPlaceholder('Sua senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('E-mail ou senha inválidos.')).toBeVisible();
  await page.screenshot({ path: `${PASTA}/B14-inativa-senha-certa.png` });
  await apagarConta(request, conta.id);
});
