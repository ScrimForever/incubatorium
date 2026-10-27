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
import { Router } from '@angular/router';
import { Observable, forkJoin, of, switchMap } from 'rxjs';

import { APP_ROUTES } from '../../core/constants/app-constants';
import { ApiError, SessionUser } from '../../core/models/auth';
import { Horario } from '../../core/models/consultoria';
import { Auth } from '../../core/services/auth';
import {
  ConsultoriasService,
  dataLocal,
  horaLocal,
  porDia,
  rotuloData,
} from '../../core/services/consultorias';
import { Icone } from '../../shared/components/icone/icone';
import { Painel } from '../../shared/components/painel/painel';

/** Um horário como o template mostra. */
interface Vaga {
  readonly horario: Horario;
  readonly dia: string;
  readonly hora: string;
  readonly consultor: string;
}

const vagaDe = (horario: Horario): Vaga => ({
  horario,
  dia: rotuloData(dataLocal(horario.inicio)),
  hora: `${horaLocal(horario.inicio)} às ${horaLocal(horario.fim)}`,
  consultor: horario.consultor_email,
});

/** "Todos" é o filtro sem consultor. */
const TODOS = '';

/**
 * Consultorias do incubado: as reservas dele e os horários livres para
 * reservar. Reservar é direto — sem aceite do consultor —, como a API faz.
 */
@Component({
  selector: 'app-agendar-consultoria',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Painel, Icone],
  templateUrl: './agendar-consultoria.html',
  styleUrl: './agendar-consultoria.scss',
})
export class AgendarConsultoria implements OnInit {
  private readonly auth = inject(Auth);
  private readonly service = inject(ConsultoriasService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly user = signal<SessionUser | null>(null);
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly mensagemErro = signal('');
  protected readonly mensagemSucesso = signal('');
  protected readonly erroModal = signal('');

  private readonly livres = signal<Horario[]>([]);
  private readonly reservas = signal<Horario[]>([]);

  protected readonly filtro = signal(TODOS);
  protected readonly todos = TODOS;

  protected readonly minhas = computed(() => this.reservas().map(vagaDe));

  /** Consultores com horário livre, para o filtro — só o e-mail: é o que a API dá. */
  protected readonly consultores = computed(() =>
    [...new Set(this.livres().map((horario) => horario.consultor_email))].sort(),
  );

  protected readonly dias = computed(() => {
    const filtro = this.filtro();
    const visiveis = this.livres().filter(
      (horario) => filtro === TODOS || horario.consultor_email === filtro,
    );
    return porDia(visiveis).map(({ data, horarios }) => ({
      data,
      rotulo: rotuloData(data),
      vagas: horarios.map((horario) => ({
        horario,
        hora: horaLocal(horario.inicio),
        titulo: `${horaLocal(horario.inicio)} às ${horaLocal(horario.fim)} com ${horario.consultor_email}`,
      })),
    }));
  });

  protected readonly totalLivres = computed(() => this.livres().length);

  /** O horário que o incubado escolheu e ainda não confirmou. */
  protected readonly escolhida = signal<Vaga | null>(null);

  ngOnInit(): void {
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

    this.executar(of(null), '');
  }

  protected escolher(horario: Horario): void {
    this.erroModal.set('');
    this.escolhida.set(vagaDe(horario));
  }

  protected fechar(): void {
    this.escolhida.set(null);
    this.erroModal.set('');
  }

  protected reservar(): void {
    const vaga = this.escolhida();
    if (!vaga || this.salvando()) {
      return;
    }
    this.executar(
      this.service.reservar(vaga.horario.id),
      `Consultoria reservada: ${vaga.dia}, ${vaga.hora}, com ${vaga.consultor}.`,
    );
  }

  /** Só atualiza as listas, sem mexer em mensagem nem na confirmação aberta. */
  private reler(): void {
    forkJoin({ minhas: this.service.minhas(), livres: this.service.livres() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ minhas, livres }) => {
        this.reservas.set(minhas);
        this.livres.set(livres);
      });
  }

  /**
   * Relê reservas e livres depois de toda escrita: o horário reservado sai de
   * uma lista e entra na outra. Erro com a confirmação aberta fica nela.
   */
  private executar(acao: Observable<unknown>, sucesso: string): void {
    this.salvando.set(true);
    this.mensagemErro.set('');
    this.mensagemSucesso.set('');
    this.erroModal.set('');
    acao
      .pipe(
        switchMap(() => forkJoin({ minhas: this.service.minhas(), livres: this.service.livres() })),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ minhas, livres }) => {
          this.reservas.set(minhas);
          this.livres.set(livres);
          this.carregando.set(false);
          this.salvando.set(false);
          this.escolhida.set(null);
          this.mensagemSucesso.set(sucesso);
          // O consultor filtrado pode ter ficado sem horário livre.
          if (!this.consultores().includes(this.filtro())) {
            this.filtro.set(TODOS);
          }
        },
        error: (err: ApiError) => {
          this.carregando.set(false);
          this.salvando.set(false);
          if (this.escolhida()) {
            this.erroModal.set(err.message);
            // A recusa costuma ser vaga que outro incubado levou: relê para ela sumir.
            this.reler();
          } else {
            this.mensagemErro.set(err.message);
          }
        },
      });
  }
}
