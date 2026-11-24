import { Page, expect } from '@playwright/test';

/**
 * Contas do banco local (docs/referencia.md, "Contas de teste", e
 * docs/relatorio-e2e-2026-11-19.md). Só valem no Postgres do Docker.
 */
export const CONTAS = {
  admin: { email: 'admin.status@teccampos.com', senha: '12345678' },
  consultor: { email: 'e2e.con@teccampos.com', senha: '12345678' },
  colaborador: { email: 'e2e.col@teccampos.com', senha: '12345678' },
  incubado: { email: 'e2e.ui@teccampos.com', senha: '12345678' },
} as const;

export type Papel = keyof typeof CONTAS;

export async function entrar(page: Page, papel: Papel): Promise<void> {
  const { email, senha } = CONTAS[papel];
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/login');
  await page.getByPlaceholder('seu@email.com').fill(email);
  await page.getByPlaceholder('Sua senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

/** Entra com uma conta qualquer (as da massa própria, criadas pela API). */
export async function entrarComo(page: Page, email: string, senha: string): Promise<void> {
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/login');
  await page.getByPlaceholder('seu@email.com').fill(email);
  await page.getByPlaceholder('Sua senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}
