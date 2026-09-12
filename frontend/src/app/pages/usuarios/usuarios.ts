import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { APP_ROUTES, ROLE_LABEL } from '../../core/constants/app-constants';
import { ApiError, Role, SessionUser } from '../../core/models/auth';
import { Auth } from '../../core/services/auth';
import {
  AlteracaoUsuario,
  UsuarioAdmin,
  UsuariosService,
  alteracaoDePapel,
  papelDe,
} from '../../core/services/usuarios';
import { Icone } from '../../shared/components/icone/icone';
import { Painel } from '../../shared/components/painel/painel';

/** Os quatro papéis, com a explicação que aparece ao lado de cada opção. */
const PAPEIS: readonly { papel: Role; descricao: string }[] = [
  { papel: 'admin', descricao: 'Acesso total, incluindo esta tela de usuários.' },
  { papel: 'avaliador', descricao: 'Analisa e avalia os planos de negócio dos incubados.' },
  { papel: 'colaborador', descricao: 'Acompanha os planos, sem poder avaliar.' },
  { papel: 'incubado', descricao: 'Preenche o próprio plano de negócios.' },
];

const FILTROS = ['todos', 'ativos', 'inativos', 'nao-verificados', 'admins'] as const;
type Filtro = (typeof FILTROS)[number];

const ROTULO_FILTRO: Record<Filtro, string> = {
  todos: 'Todos',
  ativos: 'Ativos',
  inativos: 'Inativos',
  'nao-verificados': 'Não verificados',
  admins: 'Administradores',
};

/** "1 conta" e "2 contas" — o número junto da palavra na forma certa. */
const plural = (quantidade: number, singular: string, plural: string): string =>
  `${quantidade} ${quantidade === 1 ? singular : plural}`;

/**
 * Usuários do sistema — administração de contas, só para superusuário.
 *
 * A lista é para varrer; a edição acontece no painel que abre ao escolher uma
 * conta, e as mudanças ficam em rascunho até o Salvar. Excluir fica à parte, com
 * confirmação.
 *
 * Ler, alterar e excluir são chamadas reais; só a lista vem do mock, porque
 * `GET /users` não existe no backend.
 */
@Component({
  selector: 'app-usuarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Painel, Icone],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.scss',
})
export class Usuarios implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly service = inject(UsuariosService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly user = signal<SessionUser | null>(null);
  protected readonly usuarios = signal<UsuarioAdmin[]>([]);
  protected readonly carregando = signal(true);
  protected readonly mensagemErro = signal('');
  /** Guardado à parte: 404 na listagem tem explicação própria. */
  protected readonly semEndpoint = signal(false);
  protected readonly salvando = signal(false);
  protected readonly salvo = signal(false);
  protected readonly confirmandoExclusao = signal(false);

  protected readonly papeis = PAPEIS;
  protected readonly rotuloPapel = ROLE_LABEL;
  protected readonly filtros = FILTROS;
  protected readonly rotuloFiltro = ROTULO_FILTRO;
  protected readonly filtro = signal<Filtro>('todos');
  protected readonly busca = this.fb.nonNullable.control('');
  private readonly termo = signal('');

  /** Id da conta aberta no painel lateral. Vazio = painel fechado. */
  protected readonly selecionadoId = signal('');

  /**
   * Rascunho do painel: o que o admin escolheu mas ainda não salvou. A conta na
   * lista só muda depois do Salvar — clicar num rádio não dispara requisição.
   */
  protected readonly rascunhoPapel = signal<Role>('incubado');
  protected readonly rascunhoAtiva = signal(false);
  protected readonly rascunhoVerificada = signal(false);
  protected readonly selecionado = computed(
    () => this.usuarios().find((usuario) => usuario.id === this.selecionadoId()) ?? null,
  );

  protected readonly lista = computed(() => {
    const termo = this.termo().trim().toLowerCase();
    return this.usuarios()
      .filter((usuario) => this.passaNoFiltro(usuario))
      .filter((usuario) => !termo || usuario.email.toLowerCase().includes(termo))
      .sort((a, b) => a.email.localeCompare(b.email));
  });

  /** Selos de resumo no topo, já com o plural certo. */
  protected readonly resumo = computed(() => {
    const contas = this.usuarios();
    const inativas = contas.filter((usuario) => !usuario.is_active).length;
    const naoVerificadas = contas.filter((usuario) => !usuario.is_verified).length;

    const selos = [{ texto: plural(contas.length, 'conta', 'contas'), alerta: false }];
    if (inativas) {
      selos.push({ texto: plural(inativas, 'inativa', 'inativas'), alerta: true });
    }
    if (naoVerificadas) {
      selos.push({
        texto: plural(naoVerificadas, 'não verificada', 'não verificadas'),
        alerta: true,
      });
    }
    return selos;
  });

  private passaNoFiltro(usuario: UsuarioAdmin): boolean {
    switch (this.filtro()) {
      case 'ativos':
        return usuario.is_active;
      case 'inativos':
        return !usuario.is_active;
      case 'nao-verificados':
        return !usuario.is_verified;
      case 'admins':
        return this.papel(usuario) === 'admin';
      default:
        return true;
    }
  }

  ngOnInit(): void {
    this.busca.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((valor) => this.termo.set(valor));

    this.auth
      .me()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => this.user.set(user),
        error: () => {
          this.auth.clearSession();
          void this.router.navigate([APP_ROUTES.login]);
        },
      });

    this.carregar();
  }

  private carregar(): void {
    this.carregando.set(true);
    this.service
      .listar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (usuarios) => {
          this.carregando.set(false);
          this.semEndpoint.set(false);
          this.usuarios.set(usuarios);
        },
        error: (err: ApiError) => {
          this.carregando.set(false);
          if (err.code === 'NOT_FOUND') {
            this.semEndpoint.set(true);
            return;
          }
          this.mensagemErro.set(err.message);
        },
      });
  }

  protected papel(usuario: UsuarioAdmin): Role {
    return papelDe(usuario);
  }

  /** Uma situação por linha, a mais grave primeiro. */
  protected situacao(usuario: UsuarioAdmin): { texto: string; ok: boolean } {
    if (!usuario.is_active) {
      return { texto: 'Inativa', ok: false };
    }
    if (!usuario.is_verified) {
      return { texto: 'Não verificada', ok: false };
    }
    return { texto: 'Ativa', ok: true };
  }

  /** É a própria conta de quem está logado? */
  protected ehVoce(usuario: UsuarioAdmin): boolean {
    return usuario.id === this.user()?.id;
  }

  protected abrir(usuario: UsuarioAdmin): void {
    this.selecionadoId.set(usuario.id);
    this.mensagemErro.set('');
    this.salvo.set(false);
    this.carregarRascunho(usuario);
  }

  private carregarRascunho(usuario: UsuarioAdmin): void {
    this.rascunhoPapel.set(this.papel(usuario));
    this.rascunhoAtiva.set(usuario.is_active);
    this.rascunhoVerificada.set(usuario.is_verified);
  }

  /** Há algo diferente do que está gravado? É o que habilita o Salvar. */
  protected readonly alterado = computed(() => {
    const conta = this.selecionado();
    if (!conta) {
      return false;
    }
    return (
      this.rascunhoPapel() !== this.papel(conta) ||
      this.rascunhoAtiva() !== conta.is_active ||
      this.rascunhoVerificada() !== conta.is_verified
    );
  });

  protected fechar(): void {
    this.selecionadoId.set('');
    this.confirmandoExclusao.set(false);
  }

  /** Salva de uma vez só o que mudou no rascunho. */
  protected salvar(): void {
    const conta = this.selecionado();
    if (!conta || !this.alterado()) {
      return;
    }
    const alteracao: AlteracaoUsuario = {};
    if (this.rascunhoPapel() !== this.papel(conta)) {
      Object.assign(alteracao, alteracaoDePapel(this.rascunhoPapel()));
    }
    if (this.rascunhoAtiva() !== conta.is_active) {
      alteracao.is_active = this.rascunhoAtiva();
    }
    if (this.rascunhoVerificada() !== conta.is_verified) {
      alteracao.is_verified = this.rascunhoVerificada();
    }
    this.aplicar(conta, alteracao);
  }

  /** Volta o rascunho ao que está gravado. */
  protected descartar(): void {
    const conta = this.selecionado();
    if (conta) {
      this.carregarRascunho(conta);
      this.salvo.set(false);
    }
  }

  private aplicar(usuario: UsuarioAdmin, alteracao: AlteracaoUsuario): void {
    this.salvando.set(true);
    this.salvo.set(false);
    this.mensagemErro.set('');
    this.service
      .alterar(usuario.id, alteracao)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (atualizado) => {
          this.salvando.set(false);
          this.salvo.set(true);
          this.usuarios.update((lista) =>
            lista.map((atual) =>
              atual.id === atualizado.id ? { ...atual, ...atualizado } : atual,
            ),
          );
          this.carregarRascunho({ ...usuario, ...atualizado });
        },
        error: (err: ApiError) => {
          this.salvando.set(false);
          this.mensagemErro.set(err.message);
        },
      });
  }

  protected pedirExclusao(): void {
    this.confirmandoExclusao.set(true);
  }

  protected cancelarExclusao(): void {
    this.confirmandoExclusao.set(false);
  }

  protected confirmarExclusao(): void {
    const usuario = this.selecionado();
    if (!usuario) {
      return;
    }
    this.salvando.set(true);
    this.service
      .excluir(usuario.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.salvando.set(false);
          this.confirmandoExclusao.set(false);
          this.usuarios.update((lista) => lista.filter((atual) => atual.id !== usuario.id));
          this.selecionadoId.set('');
        },
        error: (err: ApiError) => {
          this.salvando.set(false);
          this.confirmandoExclusao.set(false);
          this.mensagemErro.set(err.message);
        },
      });
  }
}
