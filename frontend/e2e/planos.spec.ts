import { APIRequestContext, expect, test } from '@playwright/test';

import { CONTAS, entrar } from './contas';

/** Os planos que o consultor de teste pode receber no banco local. */
const DESIGNADOS = [
  'e2e.curta@teccampos.com',
  'st.pendente@teccampos.com',
  'st.reaberto@teccampos.com',
];

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
  await expect(page.getByText(/^1–10 de \d+$/)).toBeVisible();
});

test('consultor só recebe os planos designados a ele', async ({ page }) => {
  const todos = page.waitForResponse((r) => r.url().endsWith('/api/questionario/todos'));
  await entrar(page, 'consultor');
  const planos = (await (await todos).json()) as { usuario_email: string }[];
  // Designados no banco local: st.pendente@ e e2e.curta@ sempre; st.reaberto@ depois
  // do teste de designação. Ninguém além deles.
  const emails = planos.map((p) => p.usuario_email);
  for (const email of ['e2e.curta@teccampos.com', 'st.pendente@teccampos.com']) {
    expect(emails).toContain(email);
  }
  for (const email of emails) {
    expect(DESIGNADOS).toContain(email);
  }
});

test('consultor abre o plano designado com a própria nota', async ({ page }) => {
  await entrar(page, 'consultor');
  await page.goto('/planos-de-negocio/st.pendente@teccampos.com');
  await expect(page.getByRole('heading', { name: 'Plano de negócios' })).toBeVisible();
  await expect(page.getByText('Observação e2e do consultor')).toBeVisible();
});

test('incubado salva o rascunho da etapa 1 no servidor', async ({ page }) => {
  await entrar(page, 'incubado');
  // Reabre na etapa em que parou: volta para a 1 pela trilha.
  await page.getByRole('button', { name: '1. Negócio' }).click();
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

const API = 'http://localhost:8000';

/** Deixa o plano de `email` em análise direto pela API, para o teste se repetir. */
async function porEmAnalise(request: APIRequestContext, email: string): Promise<void> {
  const login = await request.post(`${API}/auth/jwt/login`, {
    form: { username: CONTAS.admin.email, password: CONTAS.admin.senha },
  });
  const { access_token } = (await login.json()) as { access_token: string };
  const headers = { Authorization: `Bearer ${access_token}` };
  const planos = (await (await request.get(`${API}/questionario/todos`, { headers })).json()) as {
    id: number;
    usuario_email: string;
    json_questionario: Record<string, unknown>;
  }[];
  const plano = planos.find((p) => p.usuario_email === email);
  expect(plano, `plano de ${email} no banco local`).toBeTruthy();
  const json = { ...plano!.json_questionario };
  delete json['decisao'];
  const gravou = await request.put(`${API}/questionario/${plano!.id}`, {
    headers,
    data: { status_questionario: 'aguardando_aprovacao', json_questionario: json },
  });
  expect(gravou.status()).toBe(200);
}

test('coordenação devolve plano em análise com motivo, sem precisar de nota', async ({
  page,
  request,
}) => {
  await porEmAnalise(request, 'st.reaberto@teccampos.com');
  await entrar(page, 'admin');
  await page.goto('/planos-de-negocio/st.reaberto@teccampos.com');
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
  await entrar(page, 'consultor');
  await expect(page.getByRole('group', { name: 'Filtrar por situação' })).toHaveCount(0);

  await entrar(page, 'admin');
  await page.goto('/planos-de-negocio');
  await page.getByPlaceholder('Buscar por negócio, proponente ou e-mail').fill('e2e.inc@');
  await expect(page.getByText('Nenhum plano', { exact: false })).toBeVisible();
});

test('designar não muda o status; o consultor designado avalia e pode pedir ajuste', async ({
  page,
  request,
}) => {
  await porEmAnalise(request, 'st.reaberto@teccampos.com');
  await entrar(page, 'admin');
  await page.goto('/planos-de-negocio/st.reaberto@teccampos.com');
  await expect(page.getByRole('button', { name: 'Aprovar', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Enviar para avaliação' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByText(CONTAS.consultor.email).click();
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

  await entrar(page, 'consultor');
  await expect(page.getByText('Reaberto', { exact: true })).toBeVisible();
  await page.goto('/planos-de-negocio/st.reaberto@teccampos.com');
  await page.getByRole('button', { name: '2. Canvas' }).click();
  await expect(page.getByRole('button', { name: 'Solicitar ajuste nesta etapa' })).toBeVisible();
});

test('incubado: CNPJ inválido e etapa vazia não gravam', async ({ page }) => {
  await entrar(page, 'incubado');
  await page.getByRole('button', { name: '1. Negócio' }).click();
  const puts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PUT') puts.push(r.url());
  });
  const cnpj = page.getByPlaceholder('00.000.000/0000-00');
  await cnpj.fill('123');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(page.getByText('CNPJ inválido', { exact: false })).toBeVisible();
  await expect(page.getByText('Preencha esta etapa antes de avançar.').first()).toBeVisible();
  expect(puts).toEqual([]);
  await cnpj.fill('');
});
