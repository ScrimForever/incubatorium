import { Page, expect, test } from '@playwright/test';

import { entrar, entrarComo } from './contas';
import { SENHA, criarConta, plano } from './massa';

/**
 * Jornada completa pela tela, com vários papéis e vários status ao mesmo tempo:
 * admin cria as contas, três incubados param em pontos diferentes, dois consultores
 * avaliam, um pede ajuste, o incubado corrige, a coordenação devolve, reabre e aprova.
 * Cada passo deixa um print em docs/e2e-prints/ (fora do git).
 */
test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const marca = Date.now();
const DIR = 'docs/e2e-prints/jornada';
let n = 0;
async function print(page: Page, nome: string): Promise<void> {
  n++;
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.screenshot({
    path: `${DIR}/${String(n).padStart(2, '0')}-${nome}.png`,
    fullPage: true,
  });
}

const C = `pw.jornada.inc.${marca}@teccampos.com`;
const X = `pw.jornada.conx.${marca}@teccampos.com`;
const Y = `pw.jornada.cony.${marca}@teccampos.com`;
let A = '';
let B = '';
const NEGOCIO = `Negócio Jornada ${marca}`;

const ETAPAS = [
  '1. Negócio',
  '2. Canvas',
  '3. Sumário',
  '4. Equipe',
  '5. Produto',
  '6. Mercado',
  '7. Marketing',
  '8. Estrutura',
  '9. Financeiro',
];

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

const putPlano = (page: Page) =>
  page.waitForResponse(
    (r) => /\/api\/questionario\/\d+$/.test(r.url()) && r.request().method() === 'PUT',
  );

async function novoUsuario(page: Page, email: string, nome: string, papel: string): Promise<void> {
  await page.getByRole('button', { name: 'Novo usuário' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Nome', { exact: true }).fill(nome);
  await modal.getByLabel('Sobrenome').fill('Jornada');
  await modal.getByPlaceholder('(##) #####-####').fill('22999990000');
  await modal.getByLabel('E-mail').fill(email);
  await modal.getByLabel('Senha', { exact: true }).fill(SENHA);
  await modal.locator(`input[value=${papel}]`).check({ force: true });
  const criou = page.waitForResponse(
    (r) => r.url().endsWith('/api/usuarios') && r.request().method() === 'POST',
  );
  await modal.getByRole('button', { name: 'Criar conta' }).click();
  expect((await criou).status()).toBe(201);
  await expect(page.getByText(email)).toBeVisible();
}

async function editores(page: Page, texto: string): Promise<void> {
  const eds = page.locator('.quest-cartao .ql-editor');
  await eds.first().waitFor();
  for (let i = 0; i < (await eds.count()); i++) {
    await eds.nth(i).click();
    await page.keyboard.type(`${texto} ${i + 1}`);
  }
}

async function proximo(page: Page, etapa: string): Promise<void> {
  await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(page.locator('[aria-current="step"]', { hasText: etapa })).toBeVisible();
}

async function enviarParaAnalise(page: Page): Promise<void> {
  await page.getByRole('button', { name: '9. Financeiro' }).click();
  await page.getByRole('button', { name: 'Enviar para análise' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Enviar para análise' }).click();
  await expect(page).toHaveURL(/\/aguardando-aprovacao$/);
}

async function darNota(page: Page, etapa: string, nota: number): Promise<void> {
  await page.getByRole('button', { name: etapa }).click();
  await page.locator(`.aval-valor.nota-${nota}`).click();
  const gravou = putPlano(page);
  await page.getByRole('button', { name: 'Salvar avaliação' }).click();
  expect((await gravou).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Editar avaliação' })).toBeVisible();
}

const status = async (request: Parameters<typeof plano>[0], email: string) =>
  (await plano(request, email)).status_questionario;

test('1. admin cria incubado e dois consultores pela tela', async ({ page }) => {
  await entrar(page, 'admin');
  await page.goto('/usuarios');
  await novoUsuario(page, C, 'Carla', 'incubado');
  await novoUsuario(page, X, 'Xavier', 'avaliador');
  await novoUsuario(page, Y, 'Yara', 'avaliador');
  await page.getByPlaceholder('Buscar por nome ou e-mail').fill('pw.jornada');
  await print(page, 'admin-usuarios-criados');
});

test('2. incubado A entra e não responde nada (iniciado)', async ({ page, request }) => {
  A = (await criarConta(request, 'incubado')).email;
  await entrarComo(page, A, SENHA);
  await expect(page).toHaveURL(/\/questionario$/);
  await print(page, 'incubadoA-questionario-vazio');
  expect(await status(request, A)).toBe('iniciado');
});

test('3. incubado B salva só a etapa 1 em rascunho', async ({ page, request }) => {
  B = (await criarConta(request, 'incubado')).email;
  await entrarComo(page, B, SENHA);
  await page.getByPlaceholder('Insira o nome do proponente').fill('Bruno');
  await page.getByPlaceholder('Insira o nome do negócio').fill(`Rascunho B ${marca}`);
  await page.getByPlaceholder('Insira o setor de atuação').fill('Agro');
  const salvou = page.waitForResponse(
    (r) => r.url().endsWith('/api/questionario') && r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();
  expect((await salvou).status()).toBe(200);
  await print(page, 'incubadoB-rascunho-salvo');
  const json = (await plano(request, B)).json_questionario['1'] as { nome_negocio: string };
  expect(json.nome_negocio).toBe(`Rascunho B ${marca}`);
});

test('4. incubado C preenche as nove etapas com anexos e envia', async ({ page, request }) => {
  await entrarComo(page, C, SENHA);
  await page.getByPlaceholder('Insira o nome do proponente').fill('Carla Jornada');
  await page.getByPlaceholder('Insira o nome do negócio').fill(NEGOCIO);
  await page.getByPlaceholder('Insira o setor de atuação').fill('Tecnologia');
  await print(page, 'incubadoC-etapa1');
  await proximo(page, 'Canvas');
  await editores(page, 'Canvas');
  await proximo(page, 'Sumário');
  await editores(page, 'Sumário');
  await proximo(page, 'Equipe');
  await page.getByRole('button', { name: 'Adicionar membro' }).click();
  const membro = page.getByRole('dialog');
  await membro.getByPlaceholder('Ex.: João Paulo Ferreira').fill('Membro Jornada');
  await membro.getByPlaceholder('Ex.: Engenharia de Produção').fill('Administração');
  await membro.getByPlaceholder('Ex.: joao.ferreira@teccampos.com').fill('membro.j@teccampos.com');
  await membro.getByRole('button', { name: 'Adicionar' }).click();
  await print(page, 'incubadoC-etapa4-equipe');
  await proximo(page, 'Produto');
  await editores(page, 'Produto');
  await proximo(page, 'Mercado');
  await editores(page, 'Mercado');
  await page.locator('#anexo-mercado').setInputFiles(PDF);
  await expect(page.getByRole('button', { name: 'Pré-visualizar mercado.pdf' })).toBeVisible();
  await print(page, 'incubadoC-etapa6-anexo');
  await proximo(page, 'Marketing');
  await editores(page, 'Marketing');
  await proximo(page, 'Estrutura');
  await editores(page, 'Estrutura');
  await proximo(page, 'Financeiro');
  await page.locator('#anexo-planilhas').setInputFiles(CSV);
  await expect(page.getByRole('button', { name: 'Pré-visualizar financeiro.csv' })).toBeVisible();
  await page.getByRole('button', { name: 'Enviar para análise' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Enviar para análise' }).click();
  await expect(page).toHaveURL(/\/aguardando-aprovacao$/);
  await print(page, 'incubadoC-aguardando-aprovacao');
  expect(await status(request, C)).toBe('aguardando_aprovacao');
});

test('5. admin vê os três incubados em situações diferentes', async ({ page }) => {
  await entrar(page, 'admin');
  await page.goto('/planos-de-negocio');
  const busca = page.getByPlaceholder('Buscar por negócio, proponente ou e-mail');
  await busca.fill(A);
  await expect(page.locator('.lista-item').getByText('Não iniciado')).toBeVisible();
  await print(page, 'admin-lista-A-nao-iniciado');
  await busca.fill(B);
  await expect(page.locator('.lista-item').getByText('Em preenchimento')).toBeVisible();
  await print(page, 'admin-lista-B-em-preenchimento');
  await busca.fill(C);
  await expect(page.locator('.lista-item').getByText('Aguardando aprovação')).toBeVisible();
  await print(page, 'admin-lista-C-aguardando');
});

test('6. admin designa os dois consultores; aprovar fica travado sem notas', async ({
  page,
  request,
}) => {
  await entrar(page, 'admin');
  await page.goto(`/planos-de-negocio/${C}`);
  await expect(page.getByRole('button', { name: 'Aprovar', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Enviar para avaliação' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByText(X).click();
  await modal.getByText(Y).click();
  await print(page, 'admin-designando-X-e-Y');
  await modal.getByRole('button', { name: 'Enviar para avaliação' }).click();
  const designou = page.waitForResponse((r) =>
    r.url().endsWith('/api/questionario-selecionado-avaliadores'),
  );
  await modal.getByRole('button', { name: 'Confirmar envio' }).click();
  expect((await designou).status()).toBe(201);
  await expect(page.getByText('Avaliadores designados.', { exact: false })).toBeVisible();
  await print(page, 'admin-designados');
  expect(await status(request, C)).toBe('aguardando_aprovacao');
});

test('7. incubados A e B não aparecem para o consultor; C aparece', async ({ page }) => {
  const todos = page.waitForResponse((r) => r.url().endsWith('/api/questionario/todos'));
  await entrarComo(page, X, SENHA);
  const emails = ((await (await todos).json()) as { usuario_email: string }[]).map(
    (p) => p.usuario_email,
  );
  expect(emails).toEqual([C]);
  await print(page, 'consultorX-lista-so-C');
});

test('8. consultor X dá nota nas etapas 1 a 5', async ({ page }) => {
  await entrarComo(page, X, SENHA);
  await page.goto(`/planos-de-negocio/${C}`);
  for (const etapa of ETAPAS.slice(0, 5)) await darNota(page, etapa, 4);
  await print(page, 'consultorX-notas-1-a-5');
});

test('9. consultor Y pede ajuste no Marketing: plano volta a pendente', async ({
  page,
  request,
}) => {
  await entrarComo(page, Y, SENHA);
  await page.goto(`/planos-de-negocio/${C}`);
  await page.getByRole('button', { name: '3. Sumário' }).click();
  await expect(page.getByRole('button', { name: 'Editar avaliação' })).toHaveCount(0);
  await print(page, 'consultorY-le-nota-de-X');
  await page.getByRole('button', { name: '7. Marketing' }).click();
  await page.getByRole('button', { name: 'Solicitar ajuste nesta etapa' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('O que corrigir').fill('Inclua o orçamento de marketing.');
  await modal.getByRole('button', { name: 'Enviar para o incubado' }).click();
  await print(page, 'consultorY-pedido-ajuste');
  const gravou = putPlano(page);
  await modal.getByRole('button', { name: 'Confirmar envio' }).click();
  expect((await gravou).status()).toBe(200);
  expect(await status(request, C)).toBe('pendente');
});

test('10. incubado C corrige o Marketing e reenvia', async ({ page, request }) => {
  await entrarComo(page, C, SENHA);
  await expect(page).toHaveURL(/\/questionario$/);
  await page.getByRole('button', { name: '7. Marketing' }).click();
  await expect(page.getByText('Inclua o orçamento de marketing.')).toBeVisible();
  await print(page, 'incubadoC-ve-ajuste');
  await page.locator('.quest-cartao .ql-editor').first().click();
  await page.keyboard.type(' Orçamento: R$ 5.000/mês.');
  await enviarParaAnalise(page);
  await print(page, 'incubadoC-reenviado');
  const salvo = await plano(request, C);
  expect(salvo.status_questionario).toBe('aguardando_aprovacao');
  expect((salvo.json_questionario['7'] as { ajuste: unknown }).ajuste).toBeNull();
  expect((salvo.json_questionario['2'] as { avaliacao: { nota: number } }).avaliacao.nota).toBe(4);
});

test('11. consultor Y dá nota nas etapas 6 a 9', async ({ page }) => {
  await entrarComo(page, Y, SENHA);
  await page.goto(`/planos-de-negocio/${C}`);
  for (const etapa of ETAPAS.slice(5)) await darNota(page, etapa, 5);
  await print(page, 'consultorY-notas-6-a-9');
});

test('12. coordenação devolve com motivo; o incubado vê a devolução', async ({ page, request }) => {
  await entrar(page, 'admin');
  await page.goto(`/planos-de-negocio/${C}`);
  await page.getByRole('button', { name: 'Devolver', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Devolver plano' });
  await modal.getByLabel('Motivo da devolução').fill('Falta projeção de 12 meses.');
  await print(page, 'admin-devolvendo');
  const gravou = putPlano(page);
  await modal.getByRole('button', { name: 'Devolver plano' }).click();
  expect((await gravou).status()).toBe(200);
  expect(await status(request, C)).toBe('rejeitado');

  await entrarComo(page, C, SENHA);
  await expect(page).toHaveURL(/\/plano-rejeitado$/);
  await expect(page.getByText('Falta projeção de 12 meses.')).toBeVisible();
  await print(page, 'incubadoC-plano-rejeitado');
});

test('13. coordenação reabre; incubado corrige e reenvia', async ({ page, request }) => {
  await entrar(page, 'admin');
  await page.goto(`/planos-de-negocio/${C}`);
  await page.getByRole('button', { name: 'Reabrir para edição' }).click();
  const gravou = putPlano(page);
  await page.getByRole('button', { name: 'Reabrir plano' }).click();
  expect((await gravou).status()).toBe(200);
  expect(await status(request, C)).toBe('pendente');

  await entrarComo(page, C, SENHA);
  await expect(page).toHaveURL(/\/questionario$/);
  await expect(page.getByText('Falta projeção de 12 meses.')).toBeVisible();
  await print(page, 'incubadoC-reaberto-com-motivo');
  await page.getByRole('button', { name: '9. Financeiro' }).click();
  await page.locator('#anexo-planilhas').setInputFiles({ ...CSV, name: 'projecao12m.csv' });
  await expect(page.getByRole('button', { name: 'Pré-visualizar projecao12m.csv' })).toBeVisible();
  await enviarParaAnalise(page);
  expect(await status(request, C)).toBe('aguardando_aprovacao');
});

test('14. coordenação aprova com as nove notas; incubado vê o plano aprovado', async ({
  page,
  request,
}) => {
  await entrar(page, 'admin');
  await page.goto(`/planos-de-negocio/${C}`);
  const aprovar = page.getByRole('button', { name: 'Aprovar', exact: true });
  await expect(aprovar).toBeEnabled();
  await print(page, 'admin-pronto-para-aprovar');
  await aprovar.click();
  const gravou = putPlano(page);
  await page
    .getByRole('alertdialog', { name: 'Aprovar plano' })
    .getByRole('button', { name: 'Aprovar plano' })
    .click();
  expect((await gravou).status()).toBe(200);
  expect(await status(request, C)).toBe('aprovado');

  await entrarComo(page, C, SENHA);
  await page.goto('/meu-plano');
  await expect(page.locator('#nome_negocio')).toHaveValue(NEGOCIO);
  await print(page, 'incubadoC-meu-plano-aprovado');
});

test('15. consultor vê o plano na aba Aprovado; colaborador não vê o plano', async ({ page }) => {
  await entrarComo(page, X, SENHA);
  await expect(page.locator('.lista-item', { hasText: NEGOCIO })).toBeVisible();
  await print(page, 'consultorX-aprovado');

  await entrar(page, 'colaborador');
  await page.goto(`/planos-de-negocio/${C}`);
  await expect(page.locator('#nome_negocio')).toHaveCount(0);
  await print(page, 'colaborador-sem-acesso');
});

test('16. incubado não entra na área do admin nem na de outro plano', async ({ page }) => {
  await entrarComo(page, A, SENHA);
  await page.goto('/usuarios');
  await expect(page).not.toHaveURL(/\/usuarios$/);
  await page.goto(`/planos-de-negocio/${C}`);
  await expect(page.locator('#nome_negocio')).toHaveCount(0);
  await print(page, 'incubadoA-bloqueado');
});
