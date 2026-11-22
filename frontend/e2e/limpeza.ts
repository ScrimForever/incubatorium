import { request } from '@playwright/test';

import { API, tokenAdmin } from './massa';

/** Apaga, no fim da execução, toda conta `pw.*` que os testes criaram. */
export default async function limpeza(): Promise<void> {
  const contexto = await request.newContext();
  const headers = await tokenAdmin(contexto);
  const contas = (await (await contexto.get(`${API}/usuarios/todos`, { headers })).json()) as {
    id: string;
    email: string;
  }[];
  for (const conta of contas.filter((c) => c.email.startsWith('pw.'))) {
    await contexto.delete(`${API}/users/${conta.id}`, { headers });
  }
  await contexto.dispose();
}
