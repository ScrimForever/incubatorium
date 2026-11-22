import { expect, test } from '@playwright/test';

import { entrar } from './contas';

test('senha errada fica no login e oferece reenviar a ativação', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('seu@email.com').fill('admin.status@teccampos.com');
  await page.getByPlaceholder('Sua senha').fill('senha-errada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('E-mail ou senha inválidos.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reenviar e-mail de ativação' })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('cada papel entra pela sua porta', async ({ page }) => {
  await entrar(page, 'admin');
  await expect(page).toHaveURL(/\/dashboard\/admin$/);
  await entrar(page, 'consultor');
  await expect(page).toHaveURL(/\/planos-de-negocio$/);
  await entrar(page, 'colaborador');
  await expect(page).toHaveURL(/\/dashboard\/colaborador$/);
  await entrar(page, 'incubado');
  await expect(page).toHaveURL(/\/questionario$/);
});

test('rota privada sem sessão volta para o login', async ({ page }) => {
  await page.goto('/usuarios');
  await expect(page).toHaveURL(/\/login/);
});

test('incubado não abre telas de admin nem de avaliador', async ({ page }) => {
  await entrar(page, 'incubado');
  for (const rota of ['/usuarios', '/planos-de-negocio/st.pendente@teccampos.com', '/meu-plano']) {
    await page.goto(rota);
    await expect(page).toHaveURL(/\/questionario$/);
  }
});
