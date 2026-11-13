import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { APP_ROUTES, MIN_PASSWORD_LENGTH, ROLE_LABEL } from '../../core/constants/app-constants';
import { ApiError, Role, SessionUser } from '../../core/models/auth';
import { Auth } from '../../core/services/auth';
import {
  AlteracaoUsuario,
  NovoUsuario,
  UsuarioAdmin,
  UsuariosService,
  papelDe,
} from '../../core/services/usuarios';
import { Icone } from '../../shared/components/icone/icone';
import { Paginacao } from '../../shared/components/paginacao/paginacao';
import { Painel } from '../../shared/components/painel/painel';
import { ToggleSenha } from '../../shared/components/toggle-senha/toggle-senha';
import { Mascara } from '../../shared/directives/mascara';
import { ToastService } from '../../core/services/toast';

const PAPEIS: readonly { papel: Role; descricao: string }[] = [
  { papel: 'admin', descricao: 'Acesso total, incluindo esta tela de usuários.' },
  { papel: 'avaliador', descricao: 'Analisa e avalia os planos de negócio dos incubados.' },
  { papel: 'colaborador', descricao: 'Acompanha os planos, sem poder avaliar.' },
  { papel: 'incubado', descricao: 'Preenche o próprio plano de negócios.' },
];

const FILTROS = ['todos', 'admin', 'avaliador', 'incubado', 'colaborador'] as const;
type Filtro = (typeof FILTROS)[number];

const ROTULO_FILTRO: Record<Filtro, string> = {
  todos: 'Todos',
  admin: 'Administrador',
  avaliador: 'Avaliador',
  incubado: 'Incubado',
  colaborador: 'Colaborador',
};

/** Contas por página na listagem. */
const POR_PAGINA = 10;

/** O que a busca varre — o placeholder promete nome e e-mail. */
const alvoDaBusca = (u: UsuarioAdmin): string =>
  [u.nome, u.sobrenome, u.email].filter(Boolean).join(' ').toLowerCase();

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

const FOCAVEIS = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const AVATAR_PREFIX = 'usuarios-avatar-';
/** Registro da ordem de descoberta das contas (ver `ordemDescoberta`). */
const ORDEM_KEY = 'usuarios-ordem';

/**
 * Administração de contas, só para superusuário. A lista segue o padrão dos
 * planos de negócio (plano-item + plano-acoes); a edição abre em modal. Todas
 * as operações (ler, criar, alterar, excluir, listar) são API real desde 11/11/2026.
 */
@Component({
  selector: 'app-usuarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Painel, Icone, ToggleSenha, Mascara, Paginacao],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.scss',
})
export class Usuarios implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly service = inject(UsuariosService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);
  private readonly dialogNovo = viewChild<ElementRef<HTMLElement>>('dialogNovo');
  private readonly avatarInput = viewChild<ElementRef<HTMLInputElement>>('avatarInput');
  private focoAnterior: HTMLElement | null = null;

  protected readonly user = signal<SessionUser | null>(null);
  protected readonly usuarios = signal<UsuarioAdmin[]>([]);
  protected readonly usuarioSelecionado = signal<string | null>(null);
  protected readonly carregando = signal(true);
  protected readonly mensagemErro = signal('');
  protected readonly semEndpoint = signal(false);

  // ----- modal de criação / edição -----
  protected readonly criandoUsuario = signal(false);
  /** null = modo criação; não-null = conta sendo editada. */
  protected readonly editandoUsuario = signal<UsuarioAdmin | null>(null);
  protected readonly salvandoNovo = signal(false);
  protected readonly erroNovo = signal('');
  protected readonly mostrarSenha = signal(false);
  /** Flags de situação editáveis no modo edição (fora do formNovo). */
  protected readonly editAtiva = signal(false);
  protected readonly editVerificada = signal(false);
  /** Confirmação de exclusão dentro do fluxo de edição. */
  protected readonly confirmandoExclusao = signal(false);
  protected readonly salvandoExclusao = signal(false);
  /** Avatares por userId carregados do localStorage. */
  protected readonly avatares = signal<Record<string, string>>({});

  protected readonly formNovo = this.fb.nonNullable.group({
    nome: ['', Validators.required],
    sobrenome: ['', Validators.required],
    telefone: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
    perfil: ['incubado' as Role],
  });

  protected readonly papeis = PAPEIS;
  protected readonly rotuloPapel = ROLE_LABEL;
  protected readonly filtros = FILTROS;
  protected readonly rotuloFiltro = ROTULO_FILTRO;
  protected readonly filtro = signal<Filtro>('todos');
  protected readonly busca = this.fb.nonNullable.control('');
  private readonly termo = signal('');

  protected readonly porPagina = POR_PAGINA;
  protected readonly pagina = signal(1);
  /**
   * Ordem de descoberta: id da conta → número crescente, guardado no navegador.
   * O `UserRead` não tem data de criação e o `id` é UUID aleatório, então essa é
   * a única recência que o frontend pode ter sem mexer no backend: conta que
   * esta tela nunca tinha visto é mais nova que as que ela já conhecia, e a
   * criada aqui é a mais nova de todas. Sobrevive ao F5; some ao limpar o
   * navegador, e aí a lista volta a ser alfabética.
   */
  private readonly ordem = signal<Record<string, number>>({});

  /** Mais recente primeiro, pela ordem de descoberta; empate resolve por e-mail. */
  protected readonly lista = computed(() => {
    const termo = this.termo().trim().toLowerCase();
    const ordem = this.ordem();
    return this.usuarios()
      .filter((u) => this.passaNoFiltro(u))
      .filter((u) => !termo || alvoDaBusca(u).includes(termo))
      .sort((a, b) => (ordem[b.id] ?? 0) - (ordem[a.id] ?? 0) || a.email.localeCompare(b.email));
  });

  protected readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.lista().length / POR_PAGINA)),
  );

  /** Página corrente já presa ao total (filtro pode encolher a lista). */
  protected readonly paginaAtual = computed(() => Math.min(this.pagina(), this.totalPaginas()));

  protected readonly listaPaginada = computed(() => {
    const inicio = (this.paginaAtual() - 1) * POR_PAGINA;
    return this.lista().slice(inicio, inicio + POR_PAGINA);
  });

  protected irParaPagina(n: number): void {
    this.pagina.set(Math.min(Math.max(1, n), this.totalPaginas()));
  }

  protected readonly resumo = computed(() => {
    const contas = this.usuarios();
    const inativas = contas.filter((u) => !u.is_active).length;
    const naoVerificadas = contas.filter((u) => !u.is_verified).length;
    const selos = [{ texto: plural(contas.length, 'conta', 'contas'), alerta: false }];
    if (inativas) selos.push({ texto: plural(inativas, 'inativa', 'inativas'), alerta: true });
    if (naoVerificadas)
      selos.push({
        texto: plural(naoVerificadas, 'não verificada', 'não verificadas'),
        alerta: true,
      });
    return selos;
  });

  private passaNoFiltro(u: UsuarioAdmin): boolean {
    const filtroAtual = this.filtro();
    if (filtroAtual === 'todos') return true;
    return this.papel(u) === filtroAtual;
  }

  constructor() {
    effect(() => {
      const dialog = this.dialogNovo();
      if (this.criandoUsuario() && dialog) {
        dialog.nativeElement.querySelector<HTMLElement>(FOCAVEIS)?.focus();
      } else if (!this.criandoUsuario() && this.focoAnterior) {
        this.focoAnterior.focus();
        this.focoAnterior = null;
      }
    });
  }

  ngOnInit(): void {
    this.busca.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => {
      this.termo.set(v);
      this.pagina.set(1);
    });

    this.auth
      .me()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (u) => this.user.set(u),
        error: () => {
          this.auth.clearSession();
          void this.router.navigate([APP_ROUTES.login]);
        },
      });

    this.carregarAvatares();
    this.carregarOrdem();
    this.carregar();
  }

  private carregar(): void {
    this.carregando.set(true);
    this.service
      .listar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (us) => {
          this.carregando.set(false);
          this.semEndpoint.set(false);
          this.usuarios.set(us);
          this.registrarOrdem(us.map((u) => u.id));
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

  private carregarAvatares(): void {
    const result: Record<string, string> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(AVATAR_PREFIX)) {
          result[key.slice(AVATAR_PREFIX.length)] = localStorage.getItem(key) ?? '';
        }
      }
    } catch {
      // localStorage bloqueado; avatares ficam sem carregar
    }
    this.avatares.set(result);
  }

  /**
   * Dá número de ordem a todo id ainda sem um e esquece os que saíram da API.
   * `primeiro` (a conta acabada de criar) fica acima de todas; os demais ids
   * novos entram em ordem alfabética, para a primeira visita bater com a lista
   * do servidor.
   */
  private registrarOrdem(ids: string[], primeiro?: string): void {
    const atual = this.ordem();
    const conhecidos = new Set(ids);
    const proximo: Record<string, number> = {};
    for (const [id, n] of Object.entries(atual)) {
      if (conhecidos.has(id)) proximo[id] = n;
    }
    let maior = Math.max(0, ...Object.values(proximo));
    const novos = ids.filter((id) => proximo[id] === undefined && id !== primeiro).sort();
    for (const id of novos) proximo[id] = ++maior;
    if (primeiro && proximo[primeiro] === undefined) proximo[primeiro] = ++maior;
    this.ordem.set(proximo);
    try {
      localStorage.setItem(ORDEM_KEY, JSON.stringify(proximo));
    } catch {
      // localStorage bloqueado; a ordem vale só nesta visita
    }
  }

  private carregarOrdem(): void {
    try {
      const cru = localStorage.getItem(ORDEM_KEY);
      const lido: unknown = cru ? JSON.parse(cru) : null;
      if (lido && typeof lido === 'object') {
        const limpo: Record<string, number> = {};
        for (const [id, n] of Object.entries(lido as Record<string, unknown>)) {
          if (typeof n === 'number' && Number.isFinite(n)) limpo[id] = n;
        }
        this.ordem.set(limpo);
      }
    } catch {
      // registro ilegível; a lista nasce alfabética
    }
  }

  protected papel(u: UsuarioAdmin): Role {
    return papelDe(u);
  }

  protected classeStatus(u: UsuarioAdmin): string {
    if (!u.is_active) return 'selo';
    if (!u.is_verified) return 'selo';
    return 'selo selo--ok';
  }

  protected textoStatus(u: UsuarioAdmin): string {
    if (!u.is_active) return 'Inativa';
    if (!u.is_verified) return 'Não verificada';
    return 'Ativa';
  }

  protected iniciais(u: UsuarioAdmin): string {
    const n = u.nome?.trim();
    const s = u.sobrenome?.trim();
    if (n && s) return (n[0] + s[0]).toUpperCase();
    if (n) return n[0].toUpperCase();
    return u.email[0].toUpperCase();
  }

  protected getAvatar(id: string): string {
    return this.avatares()[id] ?? '';
  }

  protected escolherAvatar(): void {
    this.avatarInput()?.nativeElement.click();
  }

  protected onAvatarSelecionado(event: Event): void {
    const alvo = this.editandoUsuario();
    if (!alvo) return;
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      try {
        localStorage.setItem(`${AVATAR_PREFIX}${alvo.id}`, dataUrl);
      } catch {
        // localStorage cheio; imagem exibida mas não persiste
      }
      this.avatares.update((prev) => ({ ...prev, [alvo.id]: dataUrl }));
    };
    reader.readAsDataURL(file);
  }

  protected ehVoce(u: UsuarioAdmin): boolean {
    return u.id === this.user()?.id;
  }

  protected trocarFiltro(novoFiltro: Filtro): void {
    this.filtro.set(novoFiltro);
    this.pagina.set(1);
  }

  protected abrirNovo(): void {
    this.focoAnterior = document.activeElement as HTMLElement;
    this.editandoUsuario.set(null);
    this.erroNovo.set('');
    this.mostrarSenha.set(false);
    this.confirmandoExclusao.set(false);
    this.formNovo.controls.email.enable();
    this.formNovo.controls.password.setValidators([
      Validators.required,
      Validators.minLength(MIN_PASSWORD_LENGTH),
    ]);
    this.formNovo.controls.password.updateValueAndValidity();
    this.formNovo.reset({ perfil: 'incubado' });
    this.criandoUsuario.set(true);
  }

  protected abrirEditar(u: UsuarioAdmin): void {
    this.usuarioSelecionado.set(u.id);
    this.focoAnterior = document.activeElement as HTMLElement;
    this.editandoUsuario.set(u);
    this.erroNovo.set('');
    this.mostrarSenha.set(false);
    this.confirmandoExclusao.set(false);
    this.editAtiva.set(u.is_active);
    this.editVerificada.set(u.is_verified);
    this.formNovo.controls.email.disable();
    this.formNovo.controls.password.setValidators([Validators.minLength(MIN_PASSWORD_LENGTH)]);
    this.formNovo.controls.password.updateValueAndValidity();
    this.formNovo.reset({
      nome: u.nome ?? '',
      sobrenome: u.sobrenome ?? '',
      telefone: u.telefone ?? '',
      email: u.email,
      password: '',
      perfil: this.papel(u),
    });
    this.criandoUsuario.set(true);
  }

  protected fecharNovo(): void {
    this.criandoUsuario.set(false);
    this.editandoUsuario.set(null);
    this.usuarioSelecionado.set(null);
    this.confirmandoExclusao.set(false);
  }

  protected confirmarNovo(): void {
    if (this.formNovo.invalid) {
      this.formNovo.markAllAsTouched();
      return;
    }

    const alvoEditar = this.editandoUsuario();

    if (alvoEditar) {
      const { nome, sobrenome, telefone, password } = this.formNovo.getRawValue();
      const alteracao: AlteracaoUsuario = { nome, sobrenome, telefone };
      if (password) alteracao.password = password;
      if (this.editAtiva() !== alvoEditar.is_active) alteracao.is_active = this.editAtiva();
      if (this.editVerificada() !== alvoEditar.is_verified)
        alteracao.is_verified = this.editVerificada();

      this.salvandoNovo.set(true);
      this.erroNovo.set('');
      this.service
        .alterar(alvoEditar.email, alteracao)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (atualizado) => {
            this.salvandoNovo.set(false);
            const merged: UsuarioAdmin = {
              ...alvoEditar,
              ...atualizado,
              nome: atualizado.nome ?? nome,
              sobrenome: atualizado.sobrenome ?? sobrenome,
              telefone: atualizado.telefone ?? telefone,
            };
            this.usuarios.update((lista) =>
              lista.map((atual) => (atual.id === merged.id ? merged : atual)),
            );
            this.fecharNovo();
            this.toast.sucesso('Usuário atualizado.');
          },
          error: (err: ApiError) => {
            this.salvandoNovo.set(false);
            if (err.code === 'CONFLICT') {
              this.formNovo.controls.email.setErrors({ 'email-duplicado': true });
            } else {
              this.erroNovo.set(err.message);
            }
          },
        });
    } else {
      const { nome, sobrenome, telefone, email, password, perfil } = this.formNovo.getRawValue();
      const dados: NovoUsuario = {
        email,
        password,
        nome,
        sobrenome,
        telefone,
        is_admin: perfil === 'admin',
        is_colaborador: perfil === 'colaborador',
        is_consultor: perfil === 'avaliador',
        is_incubado: perfil === 'incubado',
      };
      this.salvandoNovo.set(true);
      this.erroNovo.set('');
      this.service
        .criar(dados)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (criado) => {
            this.salvandoNovo.set(false);
            this.usuarios.update((lista) => [criado, ...lista]);
            this.registrarOrdem([...this.usuarios().map((u) => u.id)], criado.id);
            this.pagina.set(1);
            this.fecharNovo();
            this.toast.sucesso('Usuário criado.');
          },
          error: (err: ApiError) => {
            this.salvandoNovo.set(false);
            if (err.code === 'CONFLICT') {
              this.formNovo.controls.email.setErrors({ 'email-duplicado': true });
            } else {
              this.erroNovo.set(err.message);
            }
          },
        });
    }
  }

  protected pedirExclusao(): void {
    this.confirmandoExclusao.set(true);
  }

  protected cancelarExclusao(): void {
    this.confirmandoExclusao.set(false);
  }

  protected confirmarExclusao(): void {
    const u = this.editandoUsuario();
    if (!u) return;
    this.salvandoExclusao.set(true);
    this.service
      .excluir(u.email)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.salvandoExclusao.set(false);
          this.usuarios.update((lista) => lista.filter((atual) => atual.id !== u.id));
          this.registrarOrdem(this.usuarios().map((atual) => atual.id));
          this.fecharNovo();
          this.toast.sucesso('Usuário excluído.');
        },
        error: (err: ApiError) => {
          this.salvandoExclusao.set(false);
          this.confirmandoExclusao.set(false);
          this.erroNovo.set(err.message);
        },
      });
  }
}
