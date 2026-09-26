import { HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Observable, delay, of } from 'rxjs';
import { Role } from '../models/auth';
import { UsuarioAdmin } from '../services/usuarios';

/**
 * Backend falso da listagem de usuários, só em desenvolvimento.
 *
 * `GET /users/{id}`, `PATCH` e `DELETE` são atendidos pela API real; o que falta
 * no backend é `GET /users`, e é só isso que este arquivo responde. As contas da
 * lista são fictícias, então as ações sobre elas param aqui — id real digitado na
 * busca segue para a API e é alterado de verdade.
 *
 * Quando `GET /users` existir, apague este arquivo e a linha que o importa em
 * `environments/environment.development.ts`.
 */

/** Marca procurável no bundle, para conferir que não vaza para produção. */
const MARCA = 'MOCK-USUARIOS';

const CHAVE = 'mock-usuarios-v1';
const LATENCIA_MS = 300;

/** Ids fictícios têm prefixo próprio: é o que distingue do id real. */
const PREFIXO = `${MARCA}-`;

function semente(): UsuarioAdmin[] {
  const conta = (
    sufixo: string,
    nome: string,
    email: string,
    is_active: boolean,
    is_verified: boolean,
    is_superuser: boolean,
    role: Role,
  ): UsuarioAdmin => ({
    id: `${PREFIXO}${sufixo}`,
    nome,
    email,
    is_active,
    is_verified,
    is_superuser,
    role,
  });

  // O `nome` é invenção do mock: o `User` do backend só tem e-mail (ver
  // `docs/contrato-usuarios.md`). Sem ele, a lista cai no e-mail.
  return [
    conta('1', 'Ana Souza', 'ana.souza@teccampos.com', true, true, false, 'incubado'),
    conta('2', 'Bruno Lima', 'bruno.lima@teccampos.com', true, false, false, 'incubado'),
    conta('3', 'Carla Mendes', 'carla.mendes@teccampos.com', false, false, false, 'avaliador'),
    conta('4', 'Diego Rocha', 'diego.rocha@teccampos.com', true, true, true, 'admin'),
    conta('5', 'Elisa Prado', 'elisa.prado@teccampos.com', false, true, false, 'colaborador'),
  ];
}

function ler(): UsuarioAdmin[] {
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    if (bruto) {
      return JSON.parse(bruto) as UsuarioAdmin[];
    }
  } catch {
    // sem storage: segue em memória
  }
  return semente();
}

function gravar(usuarios: UsuarioAdmin[]): UsuarioAdmin[] {
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(usuarios));
  } catch {
    // idem
  }
  return usuarios;
}

const ok = (corpo: unknown, status = 200): Observable<HttpEvent<unknown>> =>
  of(new HttpResponse({ body: corpo, status })).pipe(delay(LATENCIA_MS));

export const usuariosMockInterceptor: HttpInterceptorFn = (req, next) => {
  const rota = req.url.replace(/^\/api/, '').split('?')[0];

  // A lista inteira: o endpoint que falta.
  if (rota === '/users' && req.method === 'GET') {
    return ok(ler());
  }

  // Ações sobre contas fictícias. Id real não entra aqui.
  const id = rota.startsWith('/users/') ? rota.slice('/users/'.length) : '';
  if (!id.startsWith(PREFIXO)) {
    return next(req);
  }

  const usuarios = ler();
  const indice = usuarios.findIndex((usuario) => usuario.id === id);
  if (indice < 0) {
    return next(req);
  }

  if (req.method === 'GET') {
    return ok(usuarios[indice]);
  }

  if (req.method === 'PATCH') {
    usuarios[indice] = { ...usuarios[indice], ...(req.body as Partial<UsuarioAdmin>) };
    gravar(usuarios);
    return ok(usuarios[indice]);
  }

  if (req.method === 'DELETE') {
    usuarios.splice(indice, 1);
    gravar(usuarios);
    return ok(null, 204);
  }

  return next(req);
};
