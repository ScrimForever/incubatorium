import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ROUTES } from '../constants/api-routes';
import { Api } from '../http/api';
import { Role, UserRead } from '../models/auth';
import { papelDaConta } from './auth';

/**
 * Uma conta na visão do administrador: o `UserRead` da API mais `role`.
 * `nome/sobrenome/telefone` chegam da API real desde `eb66f85`.
 */
export interface UsuarioAdmin extends UserRead {
  role?: Role;
}

/** O que um administrador pode mudar em outra conta. */
export interface AlteracaoUsuario {
  is_active?: boolean;
  is_verified?: boolean;
  is_superuser?: boolean;
  role?: Role;
  nome?: string;
  sobrenome?: string;
  telefone?: string;
  password?: string;
}

/** Corpo de `POST /usuarios` — tudo obrigatório; exatamente uma flag verdadeira. */
export interface NovoUsuario {
  email: string;
  password: string;
  nome: string;
  sobrenome: string;
  telefone: string;
  is_admin: boolean;
  is_colaborador: boolean;
  is_consultor: boolean;
  is_incubado: boolean;
}

/**
 * Administração de contas. Tudo é API real e exige superusuário.
 * `listar()` usa `GET /usuarios/todos` (11/11/2026).
 */
@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly api = inject(Api);

  /** GET /usuarios/todos — lista todos os usuários (API real desde 11/11/2026). */
  listar(): Observable<UsuarioAdmin[]> {
    return this.api.get<UsuarioAdmin[]>(API_ROUTES.users.lista);
  }

  buscar(email: string): Observable<UsuarioAdmin> {
    return this.api.get<UsuarioAdmin>(API_ROUTES.users.porEmail(email));
  }

  /**
   * PATCH /usuarios/{email}. Como superusuário, aceita nome/sobrenome/telefone/password/is_active/is_verified/papéis.
   */
  alterar(email: string, alteracao: AlteracaoUsuario): Observable<UsuarioAdmin> {
    return this.api.patch<UsuarioAdmin>(API_ROUTES.users.porEmail(email), alteracao);
  }

  /** DELETE /users/{id} — real, e sem volta. */
  excluir(id: string): Observable<void> {
    return this.api.delete<void>(API_ROUTES.users.porEmail(id));
  }

  /** POST /usuarios — só admin; a conta nasce ativa. */
  criar(dados: NovoUsuario): Observable<UsuarioAdmin> {
    return this.api.post<UsuarioAdmin>(API_ROUTES.criarUsuario, dados);
  }
}

/**
 * O papel da conta: as flags da API, pela mesma regra da sessão (`papelDaConta`).
 */
export function papelDe(usuario: UsuarioAdmin): Role {
  return usuario.role ?? papelDaConta(usuario);
}

/** O corpo do PATCH para trocar de papel: `admin` é o único que a API grava. */
export function alteracaoDePapel(papel: Role): AlteracaoUsuario {
  return { role: papel, is_superuser: papel === 'admin' };
}
