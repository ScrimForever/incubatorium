import { APIRequestContext, expect } from '@playwright/test';

import { CONTAS } from './contas';

/**
 * Massa própria: cada spec que usa isto cria um incubado e um consultor pela API,
 * com plano completo em análise e o consultor designado, e apaga as contas no fim.
 * Assim o teste não depende do estado das contas `e2e.*` do banco local.
 */
export const API = 'http://localhost:8000';
export const SENHA = '12345678';

export interface Massa {
  incubado: string;
  consultor: string;
  planoId: number;
  ids: string[];
}

type Json = Record<string, Record<string, unknown> | unknown>;

export async function tokenAdmin(request: APIRequestContext): Promise<Record<string, string>> {
  const login = await request.post(`${API}/auth/jwt/login`, {
    form: { username: CONTAS.admin.email, password: CONTAS.admin.senha },
  });
  const { access_token } = (await login.json()) as { access_token: string };
  return { Authorization: `Bearer ${access_token}` };
}

const html = (texto: string) => `<p>${texto}</p>`;

/** As nove etapas preenchidas, sem nota nem ajuste. */
export function planoCompleto(nome: string): Json {
  const base = { ajuste: null, avaliacao: null };
  return {
    '1': {
      ...base,
      nome_proponente: 'Proponente PW',
      nome_negocio: nome,
      setor_atuacao: 'Tecnologia',
      cnpj: '',
    },
    '2': { ...base, business_canvas: html('Canvas do teste.') },
    '3': { ...base, sumario_executivo: html('Sumário do teste.') },
    '4': {
      ajuste: null,
      avaliacao: null,
      equipe: [
        {
          id: 'm1',
          nome: 'Membro PW',
          email: 'membro.pw@teccampos.com',
          telefone: '(22) 99999-0000',
          experiencia: '5 anos',
          formacao_academica: 'Engenharia',
        },
      ],
    },
    '5': { ...base, planejamento_produto: html('Produto do teste.') },
    '6': {
      ...base,
      arquivos: [],
      analise_acao: html('Ação.'),
      concorrentes: html('Concorrentes.'),
    },
    '7': { ...base, planejamento_marketing: html('Marketing.') },
    '8': { ...base, planejamento_estrutura: html('Estrutura.') },
    '9': { ...base, arquivos: [], observacoes: html('Observações.') },
  };
}

/** Lê o plano de `email` (com `id`) pela visão da coordenação. */
export async function plano(
  request: APIRequestContext,
  email: string,
): Promise<{ id: number; status_questionario: string; json_questionario: Json }> {
  const headers = await tokenAdmin(request);
  const todos = (await (await request.get(`${API}/questionario/todos`, { headers })).json()) as {
    id: number;
    usuario_email: string;
    status_questionario: string;
    json_questionario: Json;
  }[];
  const achado = todos.find((p) => p.usuario_email === email);
  expect(achado, `plano de ${email}`).toBeTruthy();
  return achado!;
}

/** Grava o plano pela rota da coordenação. */
export async function gravarPlano(
  request: APIRequestContext,
  id: number,
  status: string,
  json: Json,
): Promise<void> {
  const headers = await tokenAdmin(request);
  const r = await request.put(`${API}/questionario/${id}`, {
    headers,
    data: { status_questionario: status, json_questionario: json },
  });
  expect(r.status()).toBe(200);
}

/** O plano completo com as nove notas do consultor. */
export function comNoveNotas(json: Json, avaliador: string): Json {
  const saida: Json = { ...json };
  for (let n = 1; n <= 9; n++) {
    saida[String(n)] = {
      ...(json[String(n)] as Record<string, unknown>),
      avaliacao: { nota: 4, avaliador, comentario: html('Ok.') },
    };
  }
  return saida;
}

let seq = 0;

/** Cria uma conta ativa pelo `POST /usuarios`; o incubado nasce com plano `iniciado`. */
export async function criarConta(
  request: APIRequestContext,
  papel: 'incubado' | 'consultor',
): Promise<{ email: string; id: string }> {
  const headers = await tokenAdmin(request);
  const email = `pw.${papel}.${Date.now()}.${seq++}@teccampos.com`;
  const r = await request.post(`${API}/usuarios`, {
    headers,
    data: {
      email,
      password: SENHA,
      nome: papel === 'incubado' ? 'Incubado' : 'Consultor',
      sobrenome: 'PW',
      telefone: '22999990000',
      [`is_${papel}`]: true,
    },
  });
  expect(r.status(), `criar ${email}`).toBe(201);
  return { email, id: ((await r.json()) as { id: string }).id };
}

export async function criarMassa(request: APIRequestContext): Promise<Massa> {
  const headers = await tokenAdmin(request);
  const marca = Date.now();
  const incubado = await criarConta(request, 'incubado');
  const consultor = await criarConta(request, 'consultor');
  const { id } = await plano(request, incubado.email);
  await gravarPlano(request, id, 'aguardando_aprovacao', planoCompleto(`Negócio PW ${marca}`));
  const designou = await request.post(`${API}/questionario-selecionado-avaliadores`, {
    headers,
    data: { questionario_id: id, avaliadores: [consultor.email] },
  });
  expect(designou.status(), await designou.text()).toBeLessThan(300);
  return {
    incubado: incubado.email,
    consultor: consultor.email,
    planoId: id,
    ids: [incubado.id, consultor.id],
  };
}

export async function apagarMassa(request: APIRequestContext, massa?: Massa): Promise<void> {
  if (!massa) {
    return;
  }
  const headers = await tokenAdmin(request);
  for (const id of massa.ids) {
    await request.delete(`${API}/users/${id}`, { headers });
  }
}

export async function apagarConta(request: APIRequestContext, id?: string): Promise<void> {
  if (id) {
    await request.delete(`${API}/users/${id}`, { headers: await tokenAdmin(request) });
  }
}
