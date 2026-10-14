import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ROUTES } from '../constants/api-routes';
import { Api } from '../http/api';
import { Role, UserRead } from '../models/auth';
import { papelDaConta } from './auth';

/**
 * Uma conta na visão do administrador: o `UserRead` da API mais dois campos que
 * só o mock da listagem preenche (`role` e `nome`). Conta real não traz nenhum.
 */
export interface UsuarioAdmin extends UserRead {
  role?: Role;
  nome?: string;
}

/** O que um administrador pode mudar em outra conta. */
export interface AlteracaoUsuario {
  is_active?: boolean;
  is_verified?: boolean;
  is_superuser?: boolean;
  role?: Role;
}

/**
 * Administração de contas. Tudo é API real e exige superusuário, exceto
 * `listar()`: o backend não publica `GET /users`, e o mock responde em
 * desenvolvimento.
 */
@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly api = inject(Api);

  /** GET /users — ainda não existe no backend (`docs/contrato-usuarios.md`). */
  listar(): Observable<UsuarioAdmin[]> {
    return this.api.get<UsuarioAdmin[]>(API_ROUTES.users.lista);
  }

  buscar(id: string): Observable<UsuarioAdmin> {
    return this.api.get<UsuarioAdmin>(API_ROUTES.users.porId(id));
  }

  /**
   * PATCH /users/{id}. Como superusuário, os campos privilegiados valem. `role`
   * viaja junto: a API ignora o campo desconhecido, e o mock o guarda.
   */
  alterar(id: string, alteracao: AlteracaoUsuario): Observable<UsuarioAdmin> {
    return this.api.patch<UsuarioAdmin>(API_ROUTES.users.porId(id), alteracao);
  }

  /** DELETE /users/{id} — real, e sem volta. */
  excluir(id: string): Observable<void> {
    return this.api.delete<void>(API_ROUTES.users.porId(id));
  }
}

/**
 * O papel da conta: o `role` que o mock guardou, ou — conta real — as flags da
 * API, pela mesma regra da sessão (`papelDaConta`).
 */
export function papelDe(usuario: UsuarioAdmin): Role {
  return usuario.role ?? papelDaConta(usuario);
}

/** O corpo do PATCH para trocar de papel: `admin` é o único que a API grava. */
export function alteracaoDePapel(papel: Role): AlteracaoUsuario {
  return { role: papel, is_superuser: papel === 'admin' };
}
