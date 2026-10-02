"""Exceções de regras de negócio, convertidas em JSON `{"mensagem": ...}` pela API."""


class NegocioError(Exception):
    """Base das falhas esperadas de negócio."""

    status_code = 400

    def __init__(self, mensagem: str) -> None:
        self.mensagem = mensagem
        super().__init__(mensagem)


class NaoEncontradoError(NegocioError):
    status_code = 404

    def __init__(self, mensagem: str = "Recurso não encontrado.") -> None:
        super().__init__(mensagem)


class SemPermissaoError(NegocioError):
    status_code = 403

    def __init__(self, mensagem: str = "Sem permissão para esta operação.") -> None:
        super().__init__(mensagem)


class ConflitoError(NegocioError):
    status_code = 409

    def __init__(
        self, mensagem: str = "Operação em conflito com o estado atual."
    ) -> None:
        super().__init__(mensagem)


class PedidoJaDecididoError(ConflitoError):
    def __init__(self) -> None:
        super().__init__("O pedido de ingresso já foi decidido ou não está em análise.")


class MotivoObrigatorioError(NegocioError):
    status_code = 422

    def __init__(self) -> None:
        super().__init__("O motivo é obrigatório na rejeição.")


class EtapaInvalidaError(NegocioError):
    status_code = 422

    def __init__(self, etapa_id: int) -> None:
        super().__init__(f"A etapa {etapa_id} não existe.")


class EtapaNaoAvaliavelError(NegocioError):
    status_code = 422

    def __init__(self, etapa_id: int) -> None:
        super().__init__(f"A etapa {etapa_id} não tem nota.")


class EtapaSemRespostaError(NegocioError):
    status_code = 422

    def __init__(self, etapa_id: int) -> None:
        super().__init__(f"A etapa {etapa_id} ainda não foi respondida.")


class ValidacaoNegocioError(NegocioError):
    status_code = 422
