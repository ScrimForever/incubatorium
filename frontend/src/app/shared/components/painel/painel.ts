import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { APP_ROUTES, ROLE_LABEL } from '../../../core/constants/app-constants';
import { Role, SessionUser } from '../../../core/models/auth';
import { Auth } from '../../../core/services/auth';
import { Icone, IconeNome } from '../icone/icone';

/** Uma entrada do menu lateral. */
interface ItemMenu {
  readonly rotulo: string;
  readonly icone: IconeNome;
  /** Definida quando o módulo existe. Sem rota, o item entra cadeado. */
  readonly rota?: string;
  /** O que falta no backend. Vazio quando o item está disponível. */
  readonly pendencia: string;
}

const bloqueado = (rotulo: string, icone: IconeNome, pendencia: string): ItemMenu => ({
  rotulo,
  icone,
  pendencia,
});

// `GET /questionario` devolve só o plano de quem está logado; sem listagem, a
// tela de quem avalia não tem como existir.
const SEM_PLANEJAMENTO = 'aguarda a listagem de planos no backend';
const SEM_AGENDA = 'aguarda os endpoints de agenda';

/**
 * O menu de cada papel. Só "Visão geral" e "Minha conta" existem hoje: o backend
 * publica apenas autenticação e usuários, então todo módulo de negócio entra
 * cadeado, com o motivo à vista em vez de uma tela vazia.
 */
export function menuPara(role: Role): readonly ItemMenu[] {
  const visaoGeral: ItemMenu = {
    rotulo: 'Visão geral',
    icone: 'painel',
    rota: APP_ROUTES.dashboard(role),
    pendencia: '',
  };
  const meuPlano: ItemMenu = {
    rotulo: 'Meu plano',
    icone: 'documento',
    rota: APP_ROUTES.meuPlano,
    pendencia: '',
  };
  const usuarios: ItemMenu = {
    rotulo: 'Usuários',
    icone: 'equipe',
    rota: APP_ROUTES.usuarios,
    pendencia: '',
  };
  const minhaConta: ItemMenu = {
    rotulo: 'Minha conta',
    icone: 'usuario',
    rota: APP_ROUTES.minhaConta,
    pendencia: '',
  };

  const porPapel: Record<Role, readonly ItemMenu[]> = {
    admin: [
      usuarios,
      bloqueado('Planos de negócio', 'documento', SEM_PLANEJAMENTO),
      bloqueado('Agenda', 'agenda', SEM_AGENDA),
      bloqueado('Práticas chaves', 'praticas', 'domínio ainda não existe no backend'),
    ],
    avaliador: [
      bloqueado('Planos de negócio', 'documento', SEM_PLANEJAMENTO),
      bloqueado('Agenda', 'agenda', SEM_AGENDA),
    ],
    colaborador: [
      bloqueado('Planos de negócio', 'documento', SEM_PLANEJAMENTO),
      bloqueado('Agenda', 'agenda', SEM_AGENDA),
    ],
    incubado: [
      meuPlano,
      bloqueado('Equipe', 'equipe', 'aguarda os endpoints de membros'),
      bloqueado('Agenda', 'agenda', SEM_AGENDA),
    ],
  };

  return [visaoGeral, ...porPapel[role], minhaConta];
}

/**
 * Casca das telas internas: menu lateral por papel, barra superior com a
 * identidade e o Sair, e o conteúdo da página projetado no meio.
 */
@Component({
  selector: 'app-painel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icone],
  templateUrl: './painel.html',
  styleUrl: './painel.scss',
})
export class Painel {
  private readonly auth = inject(Auth);

  readonly user = input.required<SessionUser>();
  /** Rótulo do item de menu correspondente à página atual. */
  readonly ativo = input('');

  protected readonly menuAberto = signal(false);
  protected readonly menu = computed(() => menuPara(this.user().role));
  protected readonly papelRotulo = computed(() => ROLE_LABEL[this.user().role]);

  protected alternarMenu(): void {
    this.menuAberto.set(!this.menuAberto());
  }

  protected sair(): void {
    this.auth.sair();
  }
}
