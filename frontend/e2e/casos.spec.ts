import { APIRequestContext, Page, expect, test } from '@playwright/test';

import { entrar, entrarComo } from './contas';
import {
  API,
  Massa,
  SENHA,
  apagarConta,
  apagarMassa,
  comNoveNotas,
  criarConta,
  criarMassa,
  gravarPlano,
  plano,
  planoCompleto,
  tokenAdmin,
} from './massa';

/**
 * Os casos que a jornada (jornada.spec.ts) não percorre: bordas de Usuários e de
 * Planos de negócio, com massa própria por teste e um print por caso em
 * docs/e2e-prints/casos/ (fora do git).
 */
test.setTimeout(120_000);

const DIR = 'docs/e2e-prints/casos';
async function print(page: Page, nome: string): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.screenshot({ path: `${DIR}/${nome}.png`, fullPage: true });
}

const putPlano = (page: Page) =>
  page.waitForResponse(
    (r) => /\/api\/questionario\/\d+$/.test(r.url()) && r.request().method() === 'PUT',
  );

async function loginRecusado(page: Page, email: string, senha: string): Promise<void> {
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/login');
  await page.getByPlaceholder('seu@email.com').fill(email);
  await page.getByPlaceholder('Sua senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
}

async function abrirContaNaLista(page: Page, email: string): Promise<void> {
  await entrar(page, 'admin');
  await page.goto('/usuarios');
  await page.getByPlaceholder('Buscar por nome ou e-mail').fill(email);
  await page
    .getByRole('button', { name: /^Ver conta de/ })
    .first()
    .click();
  await expect(page.getByRole('dialog', { name: 'Editar usuário' })).toBeVisible();
}

const salvarEdicao = async (page: Page) => {
  const salvou = page.waitForResponse(
    (r) => r.url().includes('/api/usuarios/') && r.request().method() === 'PATCH',
  );
  await page
    .getByRole('dialog', { name: 'Editar usuário' })
    .getByRole('button', { name: 'Salvar alterações' })
    .click();
  const resposta = await salvou;
  expect(resposta.status()).toBe(200);
  return resposta.request().postDataJSON() as Record<string, unknown>;
};

// ---------------------------------------------------------------- Usuários

test.describe('Usuários', () => {
  const criadas: string[] = [];
  test.afterAll(async ({ request }) => {
    for (const id of criadas) await apagarConta(request, id);
  });

  test('U1. conta desativada pelo admin não entra mais', async ({ page, request }) => {
    const conta = await criarConta(request, 'incubado');
    criadas.push(conta.id);
    await abrirContaNaLista(page, conta.email);
    await page
      .getByRole('dialog')
      .getByLabel(/Conta ativa/)
      .uncheck();
    expect(await salvarEdicao(page)).toEqual({ is_active: false });
    await loginRecusado(page, conta.email, SENHA);
    await print(page, 'U1-desativada-nao-entra');
  });

  test('U2. admin troca a senha e a pessoa entra com a nova', async ({ page, request }) => {
    const conta = await criarConta(request, 'incubado');
    criadas.push(conta.id);
    await abrirContaNaLista(page, conta.email);
    await page.locator('#novo-senha').fill('SenhaNova123');
    expect(await salvarEdicao(page)).toEqual({ password: 'SenhaNova123' });
    await loginRecusado(page, conta.email, SENHA);
    await entrarComo(page, conta.email, 'SenhaNova123');
    await print(page, 'U2-entra-com-senha-nova');
  });

  test('U3. o e-mail não é editável pelo admin', async ({ page, request }) => {
    const conta = await criarConta(request, 'incubado');
    criadas.push(conta.id);
    await abrirContaNaLista(page, conta.email);
    await expect(page.locator('#novo-email')).toHaveValue(conta.email);
    await expect(page.locator('#novo-email')).not.toBeEditable();
    await print(page, 'U3-email-travado');
  });

  test('U4. cria administrador e colaborador pela modal; cada um cai na sua entrada', async ({
    page,
  }) => {
    for (const papel of ['admin', 'colaborador'] as const) {
      const email = `pw.${papel}.${Date.now()}@teccampos.com`;
      await entrar(page, 'admin');
      await page.goto('/usuarios');
      await page.getByRole('button', { name: 'Novo usuário' }).click();
      const modal = page.getByRole('dialog');
      await modal.getByLabel('Nome', { exact: true }).fill('Papel');
      await modal.getByLabel('Sobrenome').fill(papel);
      await modal.getByPlaceholder('(##) #####-####').fill('22999990000');
      await modal.getByLabel('E-mail').fill(email);
      await modal.getByLabel('Senha', { exact: true }).fill(SENHA);
      await modal.locator(`input[value=${papel}]`).check({ force: true });
      const criou = page.waitForResponse(
        (r) => r.url().endsWith('/api/usuarios') && r.request().method() === 'POST',
      );
      await modal.getByRole('button', { name: 'Criar conta' }).click();
      expect((await criou).status()).toBe(201);
      await entrarComo(page, email, SENHA);
      await expect(page).toHaveURL(new RegExp(`/dashboard/${papel}$`));
      await print(page, `U4-entrada-${papel}`);
    }
  });

  test('U5. filtro por papel, busca e página 2', async ({ page, request }) => {
    for (let i = 0; i < 11; i++) criadas.push((await criarConta(request, 'incubado')).id);
    criadas.push((await criarConta(request, 'consultor')).id);
    await entrar(page, 'admin');
    await page.goto('/usuarios');

    await page
      .getByRole('group', { name: 'Filtrar por papel' })
      .getByRole('button', { name: 'Avaliador' })
      .click();
    await expect(page.locator('.lista-item').first()).toBeVisible();
    await expect(page.locator('.lista-item').filter({ hasNotText: 'Avaliador' })).toHaveCount(0);
    await print(page, 'U5-filtro-avaliador');

    await page
      .getByRole('group', { name: 'Filtrar por papel' })
      .getByRole('button', { name: 'Todos' })
      .click();
    await page.getByRole('button', { name: 'Página 2' }).click();
    await expect(page.getByText(/^11–\d+ de \d+$/)).toBeVisible();
    await print(page, 'U5-pagina-2');

    await page.getByPlaceholder('Buscar por nome ou e-mail').fill('e2e.col@');
    await expect(page.locator('.lista-item')).toHaveCount(1);
    await print(page, 'U5-busca');
  });
});

// ---------------------------------------------------------------- Planos

/** Envia um anexo como o dono (só dá com o plano ainda em preenchimento). */
async function anexarComoDono(
  request: APIRequestContext,
  email: string,
  aba: 6 | 9,
  nome: string,
): Promise<{ nome: string; tipo: string; tamanho: number }> {
  const login = await request.post(`${API}/auth/jwt/login`, {
    form: { username: email, password: SENHA },
  });
  const { access_token } = (await login.json()) as { access_token: string };
  const conteudo = Buffer.from('%PDF-1.4\n%%EOF\n');
  const r = await request.post(`${API}/arquivos/questionario/${aba}`, {
    headers: { Authorization: `Bearer ${access_token}` },
    multipart: { arquivos: { name: nome, mimeType: 'application/pdf', buffer: conteudo } },
  });
  expect(r.status(), await r.text()).toBeLessThan(300);
  return { nome, tipo: 'application/pdf', tamanho: conteudo.length };
}

test.describe('Planos de negócio', () => {
  test.describe.configure({ mode: 'serial' });
  let massa: Massa;

  test.beforeEach(async ({ request }) => {
    massa = await criarMassa(request);
  });
  test.afterEach(async ({ request }) => {
    await apagarMassa(request, massa);
  });

  test('P1. aprovar fica travado com 8 das 9 notas', async ({ page, request }) => {
    const json = comNoveNotas(planoCompleto('Oito notas PW'), massa.consultor);
    json['9'] = { ...(json['9'] as Record<string, unknown>), avaliacao: null };
    await gravarPlano(request, massa.planoId, 'aguardando_aprovacao', json);
    await entrar(page, 'admin');
    await page.goto(`/planos-de-negocio/${massa.incubado}`);
    await expect(page.getByRole('button', { name: 'Aprovar', exact: true })).toBeDisabled();
    await print(page, 'P1-aprovar-travado-8-notas');
  });

  test('P2. consultor edita a própria nota depois de salvar', async ({ page, request }) => {
    await entrarComo(page, massa.consultor, SENHA);
    await page.goto(`/planos-de-negocio/${massa.incubado}`);
    await page.locator('.aval-valor.nota-4').click();
    let gravou = putPlano(page);
    await page.getByRole('button', { name: 'Salvar avaliação' }).click();
    expect((await gravou).status()).toBe(200);

    await page.getByRole('button', { name: 'Editar avaliação' }).click();
    await page.locator('.aval-valor.nota-2').click();
    gravou = putPlano(page);
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    expect((await gravou).status()).toBe(200);
    await print(page, 'P2-nota-editada');
    const etapa1 = (await plano(request, massa.incubado)).json_questionario['1'] as {
      avaliacao: { nota: number };
    };
    expect(etapa1.avaliacao.nota).toBe(2);
  });

  test('P3. consultor não designado não lê o plano pela URL', async ({ page, request }) => {
    const intruso = await criarConta(request, 'consultor');
    try {
      await entrarComo(page, intruso.email, SENHA);
      await page.goto(`/planos-de-negocio/${massa.incubado}`);
      await expect(page.getByRole('alert').first()).toBeVisible();
      await expect(page.locator('#nome_negocio')).toHaveCount(0);
      await print(page, 'P3-nao-designado-bloqueado');
    } finally {
      await apagarConta(request, intruso.id);
    }
  });

  test('P4. ajuste em duas etapas: o incubado vê as duas marcadas', async ({ page, request }) => {
    await entrarComo(page, massa.consultor, SENHA);
    await page.goto(`/planos-de-negocio/${massa.incubado}`);
    for (const [etapa, texto] of [
      ['3. Sumário', 'Resuma em uma página.'],
      ['5. Produto', 'Descreva o MVP.'],
    ]) {
      await page.getByRole('button', { name: etapa }).click();
      await page.getByRole('button', { name: /Solicitar ajuste|Alterar ajuste/ }).click();
      const modal = page.getByRole('dialog');
      await modal.getByLabel('O que corrigir').fill(texto);
      await modal.getByRole('button', { name: 'Enviar para o incubado' }).click();
      const gravou = putPlano(page);
      await modal.getByRole('button', { name: 'Confirmar envio' }).click();
      expect((await gravou).status()).toBe(200);
    }
    expect((await plano(request, massa.incubado)).status_questionario).toBe('pendente');

    await entrarComo(page, massa.incubado, SENHA);
    await expect(page.locator('.quest-passo--ajuste')).toHaveCount(2);
    await page.getByRole('button', { name: '3. Sumário' }).click();
    await expect(page.getByText('Resuma em uma página.')).toBeVisible();
    await expect(page.getByText('Também há ajuste', { exact: false })).toBeVisible();
    await print(page, 'P4-incubado-dois-ajustes');
  });

  test('P5. ajuste em etapa já avaliada: o que acontece com a nota', async ({ page, request }) => {
    await entrarComo(page, massa.consultor, SENHA);
    await page.goto(`/planos-de-negocio/${massa.incubado}`);
    await page.getByRole('button', { name: '6. Mercado' }).click();
    await page.locator('.aval-valor.nota-3').click();
    let gravou = putPlano(page);
    await page.getByRole('button', { name: 'Salvar avaliação' }).click();
    expect((await gravou).status()).toBe(200);

    await page.getByRole('button', { name: 'Solicitar ajuste nesta etapa' }).click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel('O que corrigir').fill('Atualize os concorrentes.');
    await modal.getByRole('button', { name: 'Enviar para o incubado' }).click();
    gravou = putPlano(page);
    await modal.getByRole('button', { name: 'Confirmar envio' }).click();
    expect((await gravou).status()).toBe(200);
    await print(page, 'P5-ajuste-em-etapa-avaliada');

    const etapa6 = (await plano(request, massa.incubado)).json_questionario['6'] as {
      avaliacao: { nota: number } | null;
      ajuste: unknown;
    };
    expect(etapa6.ajuste).toBeTruthy();
    test.info().annotations.push({
      type: 'medido',
      description: `nota da etapa 6 depois do ajuste: ${JSON.stringify(etapa6.avaliacao)}`,
    });
  });

  test('P6. refazer a designação tira o acesso de quem saiu', async ({ page, request }) => {
    const outro = await criarConta(request, 'consultor');
    try {
      await entrar(page, 'admin');
      await page.goto(`/planos-de-negocio/${massa.incubado}`);
      await page.getByRole('button', { name: 'Enviar para avaliação' }).click();
      const modal = page.getByRole('dialog');
      await modal.getByText(outro.email).click();
      await modal.getByRole('button', { name: 'Enviar para avaliação' }).click();
      const designou = page.waitForResponse((r) =>
        r.url().endsWith('/api/questionario-selecionado-avaliadores'),
      );
      await modal.getByRole('button', { name: 'Confirmar envio' }).click();
      const corpo = (await designou).request().postDataJSON() as { avaliadores: string[] };
      expect(corpo.avaliadores).toContain(outro.email);

      const todos = page.waitForResponse((r) => r.url().endsWith('/api/questionario/todos'));
      await entrarComo(page, massa.consultor, SENHA);
      const emails = ((await (await todos).json()) as { usuario_email: string }[]).map(
        (p) => p.usuario_email,
      );
      // A lista nova substitui a antiga: quem não foi marcado de novo perde o plano.
      expect(emails.includes(massa.incubado)).toBe(corpo.avaliadores.includes(massa.consultor));
      await print(page, 'P6-lista-do-consultor-apos-redesignar');
    } finally {
      await apagarConta(request, outro.id);
    }
  });

  test('P7. incubado com plano em análise não volta ao formulário', async ({ page }) => {
    await entrarComo(page, massa.incubado, SENHA);
    await expect(page).toHaveURL(/\/aguardando-aprovacao$/);
    await page.goto('/questionario');
    await expect(page).toHaveURL(/\/aguardando-aprovacao$/);
    await print(page, 'P7-em-analise-travado');
  });

  test('P8. abas de situação filtram a lista do admin', async ({ page }) => {
    await entrar(page, 'admin');
    await page.goto('/planos-de-negocio');
    const grupo = page.getByRole('group', { name: 'Filtrar por situação' });
    await grupo.getByRole('button', { name: 'Aguardando aprovação', exact: true }).click();
    await expect(page.locator('.lista-item').first()).toBeVisible();
    await expect(
      page.locator('.lista-item').filter({ hasNotText: 'Aguardando aprovação' }),
    ).toHaveCount(0);
    await print(page, 'P8-aba-aguardando');
  });

  test('P9. devolução: incubado corrige sozinho, vê as notas e reenvia', async ({
    page,
    request,
  }) => {
    const json = comNoveNotas(planoCompleto('Devolvido PW'), massa.consultor);
    json['decisao'] = {
      status: 'rejeitado',
      justificativa: 'Inclua o fluxo de caixa.',
      por: 'admin.status@teccampos.com',
      em: new Date().toISOString(),
    };
    await gravarPlano(request, massa.planoId, 'rejeitado', json);

    await entrarComo(page, massa.incubado, SENHA);
    await expect(page).toHaveURL(/\/plano-rejeitado$/);
    await expect(page.getByText('Inclua o fluxo de caixa.')).toBeVisible();
    await expect(page.locator('app-plano-leitura')).toHaveCount(0);
    await print(page, 'P9-devolvido-so-o-topo');

    await page.getByRole('button', { name: 'Corrigir meu plano' }).click();
    await expect(page).toHaveURL(/\/questionario$/);
    await expect(page.getByText('Inclua o fluxo de caixa.')).toBeVisible();
    await expect(page.locator('.aval-card')).toBeVisible();
    await print(page, 'P9-formulario-com-motivo-e-nota');
    expect((await plano(request, massa.incubado)).status_questionario).toBe('pendente');

    // A massa deixa o Mercado incompleto (sem fornecedores nem anexo): o incubado
    // completa aqui, com o plano reaberto, e segue pela trilha até o envio.
    await page.getByRole('button', { name: '6. Mercado' }).click();
    const editores = page.locator('.quest-cartao .ql-editor');
    for (let i = 0; i < (await editores.count()); i++) {
      if (!(await editores.nth(i).innerText()).trim()) {
        await editores.nth(i).click();
        await page.keyboard.type('Fornecedores locais.');
      }
    }
    await page.locator('#anexo-mercado').setInputFiles({
      name: 'mercado.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
    });
    await expect(page.getByRole('button', { name: 'Pré-visualizar mercado.pdf' })).toBeVisible();
    for (const etapa of ['Marketing', 'Estrutura', 'Financeiro']) {
      await page.getByRole('button', { name: 'Próximo' }).click();
      await expect(page.locator('[aria-current="step"]', { hasText: etapa })).toBeVisible();
    }
    await page.locator('#anexo-planilhas').setInputFiles({
      name: 'caixa.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('mes;caixa\njan;10\n'),
    });
    await expect(page.getByRole('button', { name: 'Pré-visualizar caixa.csv' })).toBeVisible();
    await page.getByRole('button', { name: 'Enviar para análise' }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Enviar para análise' })
      .click();
    await expect(page).toHaveURL(/\/aguardando-aprovacao$/);
    const salvo = await plano(request, massa.incubado);
    expect(salvo.status_questionario).toBe('aguardando_aprovacao');
    expect(salvo.json_questionario['decisao']).toBeUndefined();
    expect((salvo.json_questionario['1'] as { avaliacao: { nota: number } }).avaliacao.nota).toBe(
      4,
    );
  });

  test('P10. plano aprovado: incubado, avaliador e admin veem o questionário completo', async ({
    page,
    request,
  }) => {
    await gravarPlano(
      request,
      massa.planoId,
      'aprovado',
      comNoveNotas(planoCompleto('Aprovado PW'), massa.consultor),
    );

    await entrarComo(page, massa.incubado, SENHA);
    await page.goto('/meu-plano');
    await expect(page.getByRole('heading', { name: 'Meu plano' })).toBeVisible();
    await expect(page.locator('#nome_negocio')).toHaveValue('Aprovado PW');
    await expect(page.locator('#nome_negocio')).not.toBeEditable();
    await expect(page.getByRole('button', { name: 'Salvar rascunho' })).toHaveCount(0);
    await expect(page.locator('.aval-card')).toBeVisible();
    await print(page, 'P10-incubado-meu-plano-etapa1');
    await page.getByRole('button', { name: '9. Financeiro' }).click();
    await expect(page.locator('#anexo-planilhas')).toHaveCount(0);
    await print(page, 'P10-incubado-meu-plano-etapa9');

    await entrarComo(page, massa.consultor, SENHA);
    await page.goto(`/planos-de-negocio/${massa.incubado}`);
    await expect(page.locator('#nome_negocio')).toHaveValue('Aprovado PW');
    await print(page, 'P10-avaliador-aprovado');

    await entrar(page, 'admin');
    await page.goto(`/planos-de-negocio/${massa.incubado}`);
    await expect(page.locator('#nome_negocio')).toHaveValue('Aprovado PW');
    await expect(page.getByRole('button', { name: 'Aprovar', exact: true })).toHaveCount(0);
    await print(page, 'P10-admin-aprovado');
  });
});

test.describe('Anexo do incubado lido por quem avalia', () => {
  let incubado: { email: string; id: string };
  let consultor: { email: string; id: string };

  test.beforeAll(async ({ request }) => {
    incubado = await criarConta(request, 'incubado');
    consultor = await criarConta(request, 'consultor');
    const anexo = await anexarComoDono(request, incubado.email, 6, 'pesquisa.pdf');
    const json = planoCompleto('Com anexo PW');
    json['6'] = { ...(json['6'] as Record<string, unknown>), arquivos: [anexo] };
    const { id } = await plano(request, incubado.email);
    await gravarPlano(request, id, 'aguardando_aprovacao', json);
    const r = await request.post(`${API}/questionario-selecionado-avaliadores`, {
      headers: await tokenAdmin(request),
      data: { questionario_id: id, avaliadores: [consultor.email] },
    });
    expect(r.status()).toBeLessThan(300);
  });
  test.afterAll(async ({ request }) => {
    await apagarConta(request, incubado?.id);
    await apagarConta(request, consultor?.id);
  });

  test('P11. avaliador abre e baixa o anexo do incubado', async ({ page }) => {
    await entrarComo(page, consultor.email, SENHA);
    await page.goto(`/planos-de-negocio/${incubado.email}`);
    await page.getByRole('button', { name: '6. Mercado' }).click();
    await expect(page.locator('#anexo-mercado')).toHaveCount(0);
    await page.getByRole('button', { name: 'Pré-visualizar pesquisa.pdf' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar' }).click();
    expect((await download).suggestedFilename()).toBe('pesquisa.pdf');
    await print(page, 'P11-avaliador-baixa-anexo');
  });

  test('P12. Imprimir com anexo abre a modal com os arquivos', async ({ page }) => {
    await entrar(page, 'admin');
    await page.goto(`/planos-de-negocio/${incubado.email}`);
    await page.getByRole('button', { name: 'Imprimir' }).click();
    const modal = page.getByRole('dialog', { name: 'Imprimir plano' });
    await expect(modal).toBeVisible();
    await expect(modal.getByText('pesquisa.pdf')).toBeVisible();
    await print(page, 'P12-imprimir-com-anexo');
  });
});
