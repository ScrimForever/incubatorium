import { expect, test } from '@playwright/test';

/** Cadastro e senha sem disparar e-mail: só validação e e-mail desconhecido. */

test('cadastro recusa senha curta e confirmação diferente sem chamar a API', async ({ page }) => {
  const chamadas: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/auth/register')) chamadas.push(r.url());
  });
  await page.goto('/registro');
  await page.getByPlaceholder('seu@email.com').fill('pw.cadastro@teccampos.com');
  await page.getByPlaceholder(/Mínimo de/).fill('123');
  await page.getByPlaceholder('Repita a senha').fill('456');
  await page.getByRole('button', { name: /Criar conta|Cadastrar/ }).click();
  await expect(page).toHaveURL(/\/registro$/);
  expect(chamadas).toEqual([]);
});

test('esqueci a senha responde igual para e-mail desconhecido', async ({ page }) => {
  await page.goto('/esqueci-senha');
  await page.getByPlaceholder('seu@email.com').fill(`ninguem.${Date.now()}@teccampos.com`);
  const resposta = page.waitForResponse((r) => r.url().endsWith('/api/auth/forgot-password'));
  await page.getByRole('button', { name: /Enviar/ }).click();
  expect((await resposta).status()).toBe(202);
  await expect(page.getByRole('heading', { name: 'Verifique seu e-mail' })).toBeVisible();
});

test('redefinir senha sem token oferece pedir um link novo', async ({ page }) => {
  await page.goto('/redefinir-senha');
  await expect(page.getByRole('link', { name: /link|Esqueci|nov/i }).first()).toBeVisible();
});
