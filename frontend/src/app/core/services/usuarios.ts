import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ROUTES } from '../constants/api-routes';
import { Api } from '../http/api';
import { Role, UserRead } from '../models/auth';

/**
 * Uma conta na visão do administrador.
 *
 * `role` ainda não vem da API: `UserRead` só expõe `is_superuser`. O campo
 * existe aqui porque o mock de desenvolvimento já o guarda, e porque é o que o
 * backend precisa passar a devolver — ver `docs/contrato-usuarios.md`.
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
}

/**
 * Administração de contas. Tudo aqui é API real e exige superusuário — a única
 * exceção é `listar()`: o backend não publica `GET /users`, e em
 * desenvolvimento essa chamada é respondida pelo mock.
 */
@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly api = inject(Api);

  /** GET /users — **ainda não existe no backend**. Ver docs/contrato-usuarios.md. */
  listar(): Observable<UsuarioAdmin[]> {
    return this.api.get<UsuarioAdmin[]>(API_ROUTES.users.lista);
  }

  buscar(id: string): Observable<UsuarioAdmin> {
    return this.api.get<UsuarioAdmin>(API_ROUTES.users.porId(id));
  }

  /**
   * PATCH /users/{id} — real. Como superusuário, os campos privilegiados valem.
   * `role` viaja junto: a API atual ignora o campo desconhecido, e o mock o
   * guarda. Quando o backend passar a aceitar, nada muda aqui.
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
 * O papel da conta. Prefere o campo `role` quando ele existir; sem ele, o único
 * papel que dá para afirmar é o do superusuário, e o resto cai em incubado.
 */
export function papelDe(usuario: UsuarioAdmin): Role {
  if (usuario.role) {
    return usuario.role;
  }
  return usuario.is_superuser ? 'admin' : 'incubado';
}

/** O corpo do PATCH para trocar de papel: `admin` é o único que a API grava. */
export function alteracaoDePapel(papel: Role): AlteracaoUsuario {
  return { role: papel, is_superuser: papel === 'admin' };
}
