/**
 * Um avaliador (consultor) que a coordenação pode designar para um plano:
 * o `UserRead` de `GET /avaliadores`, que lista as contas com `is_consultor`
 * e só responde para admin. Nome e telefone são opcionais no backend.
 */
export interface Avaliador {
  id: string;
  email: string;
  nome: string | null;
  sobrenome: string | null;
  telefone: string | null;
  is_consultor: boolean;
}

/** Corpo de `POST /questionario-selecionado-avaliadores` (substitui a seleção anterior). */
export interface DesignacaoEntrada {
  questionario_id: number;
  avaliadores: string[];
}
