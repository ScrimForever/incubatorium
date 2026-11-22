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

/**
 * Corpo de `PATCH /usuarios/{email}` (`UsuarioEditar`): campo fora daqui é `422`.
 * As quatro flags de perfil vão juntas e com exatamente uma verdadeira.
 */
export interface AlteracaoUsuario {
  nome?: string;
  sobrenome?: string;
  telefone?: string;
  password?: string;
  is_active?: boolean;
  is_admin?: boolean;
  is_colaborador?: boolean;
  is_consultor?: boolean;
  is_incubado?: boolean;
}

/** As quatro flags de perfil, só uma verdadeira — o que criar e editar mandam. */
export interface FlagsDePerfil {
  is_admin: boolean;
  is_colaborador: boolean;
  is_consultor: boolean;
  is_incubado: boolean;
}

/** Corpo de `POST /usuarios` — tudo obrigatório; exatamente uma flag verdadeira. */
export interface NovoUsuario extends FlagsDePerfil {
  email: string;
  password: string;
  nome: string;
  sobrenome: string;
  telefone: string;
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

  /** PATCH /usuarios/{email} — manda só o que mudou. */
  alterar(email: string, alteracao: AlteracaoUsuario): Observable<UsuarioAdmin> {
    return this.api.patch<UsuarioAdmin>(API_ROUTES.users.porEmail(email), alteracao);
  }

  /**
   * DELETE /users/{id} — real, e sem volta. É rota do fastapi-users: exige
   * `is_superuser`, e admin criado pelo `POST /usuarios` não tem (recusa com 403).
   */
  excluir(id: string): Observable<void> {
    return this.api.delete<void>(API_ROUTES.users.porId(id));
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

/** Papel da tela → flags da API (o `avaliador` da tela é o `is_consultor`). */
export function flagsDoPapel(papel: Role): FlagsDePerfil {
  return {
    is_admin: papel === 'admin',
    is_colaborador: papel === 'colaborador',
    is_consultor: papel === 'avaliador',
    is_incubado: papel === 'incubado',
  };
}
