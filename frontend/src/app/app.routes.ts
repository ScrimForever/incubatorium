import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { APP_ROUTES } from './core/constants/app-constants';
import { pareceJwt } from './core/auth/token-store';
import { authGuard } from './core/guards/auth-guard';
import { guestGuard } from './core/guards/guest-guard';
import { adminGuard } from './core/guards/admin-guard';
import {
  aguardandoAprovacaoGuard,
  planoAprovadoGuard,
  planoRejeitadoGuard,
  questionarioGuard,
} from './core/guards/plano-guard';

export const routes: Routes = [
  {
    path: 'login',
    title: 'TecCampos - Entrar',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'registro',
    title: 'TecCampos - Criar conta',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/registro/registro').then((m) => m.Registro),
  },
  {
    path: 'esqueci-senha',
    title: 'TecCampos - Esqueci a senha',
    loadComponent: () => import('./pages/esqueci-senha/esqueci-senha').then((m) => m.EsqueciSenha),
  },
  {
    // Destino do redirect do backend após ativar a conta pelo link do e-mail.
    // Pública e estática: não tem guard nem chama a API — só informa e leva ao login.
    path: 'conta-ativada',
    title: 'TecCampos - Conta ativada',
    loadComponent: () => import('./pages/conta-ativada/conta-ativada').then((m) => m.ContaAtivada),
  },
  {
    // Destino do link enviado por e-mail: /redefinir-senha?token=...
    path: 'redefinir-senha',
    title: 'TecCampos - Nova senha',
    loadComponent: () =>
      import('./pages/redefinir-senha/redefinir-senha').then((m) => m.RedefinirSenha),
  },
  {
    // O papel na URL é conferido contra o /users/me pela própria página.
    // Para o incubado, o painel só abre com o plano aprovado; antes disso o
    // destino sai do status do plano.
    path: 'dashboard/:role',
    title: 'TecCampos - Painel',
    canActivate: [authGuard, planoAprovadoGuard],
    loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    // Tela cheia, sem menu: a primeira coisa que o incubado vê ao entrar.
    path: 'questionario',
    title: 'TecCampos — Questionário Plano de Negócios',
    canActivate: [authGuard, questionarioGuard],
    loadComponent: () => import('./pages/questionario/questionario').then((m) => m.Questionario),
  },
  {
    // Plano enviado, fora das mãos do incubado. Tela cheia sem menu.
    path: 'aguardando-aprovacao',
    title: 'TecCampos - Plano em análise',
    canActivate: [authGuard, aguardandoAprovacaoGuard],
    loadComponent: () =>
      import('./pages/aguardando-aprovacao/aguardando-aprovacao').then(
        (m) => m.AguardandoAprovacao,
      ),
  },
  {
    // Plano devolvido, em leitura, com as observações do avaliador.
    path: 'plano-rejeitado',
    title: 'TecCampos - Plano devolvido',
    canActivate: [authGuard, planoRejeitadoGuard],
    loadComponent: () =>
      import('./pages/plano-rejeitado/plano-rejeitado').then((m) => m.PlanoRejeitado),
  },
  {
    path: 'usuarios',
    title: 'TecCampos - Usuários',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./pages/usuarios/usuarios').then((m) => m.Usuarios),
  },
  {
    // Dentro do painel: só o incubado com o plano aprovado chega aqui.
    path: 'meu-plano',
    title: 'TecCampos - Meu plano',
    canActivate: [authGuard, planoAprovadoGuard],
    loadComponent: () => import('./pages/meu-plano/meu-plano').then((m) => m.MeuPlano),
  },
  {
    // Também vive no painel, logo segue a mesma regra do dashboard.
    path: 'minha-conta',
    title: 'TecCampos - Minha conta',
    canActivate: [authGuard, planoAprovadoGuard],
    loadComponent: () => import('./pages/minha-conta/minha-conta').then((m) => m.MinhaConta),
  },
  {
    /**
     * O e-mail de redefinição manda o token na raiz — `localhost:3000/<token>`,
     * sem nome de rota. Última antes do `**`, então só pega segmento que não
     * seja nenhuma rota nomeada; sem cara de JWT, segue para a não encontrada.
     */
    path: ':token',
    redirectTo: (rota) => {
      const token = rota.params['token'] ?? '';
      return pareceJwt(token)
        ? inject(Router).createUrlTree([APP_ROUTES.redefinirSenha], { queryParams: { token } })
        : 'nao-encontrado';
    },
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: '**',
    title: 'TecCampos - Página não encontrada',
    loadComponent: () =>
      import('./pages/nao-encontrado/nao-encontrado').then((m) => m.NaoEncontrado),
  },
];
