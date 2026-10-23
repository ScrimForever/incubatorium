"""Um span por função do projeto, com argumentos, variáveis locais e retorno como atributos.

Usa `sys.monitoring` (Python 3.12+) sobre os objetos de código já carregados, então pega também
rotas e dependências do FastAPI (registradas antes), sem decorators nem wrappers. O span vira o
atual durante a função, e por isso as chamadas aninhadas e as consultas SQL ficam dentro dele.

Atenção: valores reais vão para a telemetria. Nomes sensíveis (senha, token...) são mascarados e
os textos truncados, mas o restante (e-mails, conteúdo do questionário) é gravado: use só onde
isso for aceitável (`OTEL_RASTREAR_FUNCOES`, desligado por padrão).
"""

import enum
import re
import sys
import types
from contextvars import ContextVar
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from opentelemetry import context as otel_context
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode, Tracer

_RAIZ = str(Path(__file__).resolve().parents[1])
_mon = sys.monitoring
_TOOL_ID = 3
_EVENTOS_LOCAIS = _mon.events.PY_START | _mon.events.PY_RETURN
_EVENTO_GLOBAL = _mon.events.PY_UNWIND  # não existe como evento local
_GERADORES = (
    0x20 | 0x200
)  # CO_GENERATOR | CO_ASYNC_GENERATOR: o yield quebra o par início/fim
_IGNORADOS = (
    "src.infra.instrumentacao",
    "src.infra.observabilidade",
    "src.shared.log_requisicao",
    "src.logger",
    "src.tests",
)

_SENSIVEL = re.compile(
    r"senha|password|passwd|token|secret|segredo|authorization|cookie|api_?key|hash|"
    r"credencial|codigo_ativacao",
    re.IGNORECASE,
)
_MAX_ATRIBUTOS = 40
_MAX_TEXTO = 300
_MAX_ITENS = 10
_MAX_PROFUNDIDADE = 3

_pilha: ContextVar[tuple] = ContextVar("pilha_funcoes", default=())
_ocupado: ContextVar[bool] = ContextVar("instrumentacao_ocupada", default=False)
_tracer: Tracer | None = None
_alvos: dict[types.CodeType, tuple[str, tuple[str, ...]]] = {}


def _valor(v, profundidade: int = 0):
    """Representação segura e curta de um valor (nunca levanta)."""
    try:
        if v is None or isinstance(v, bool | int | float | Decimal):
            return v
        if isinstance(v, str):
            return v[:_MAX_TEXTO]
        if isinstance(v, bytes | bytearray):
            return f"<bytes {len(v)}>"
        if isinstance(v, enum.Enum):
            return _valor(v.value, profundidade)
        if isinstance(v, datetime | date | UUID):
            return str(v)
        if profundidade >= _MAX_PROFUNDIDADE:
            return f"<{type(v).__name__}>"
        if isinstance(v, dict):
            return {
                str(k): "***"
                if _SENSIVEL.search(str(k))
                else _valor(x, profundidade + 1)
                for k, x in list(v.items())[:_MAX_ITENS]
            }
        if isinstance(v, list | tuple | set | frozenset):
            return [_valor(x, profundidade + 1) for x in list(v)[:_MAX_ITENS]]
        if hasattr(v, "model_dump"):  # pydantic
            return _valor(v.model_dump(), profundidade + 1)
        estado = getattr(v, "_sa_instance_state", None)
        if estado is not None:  # modelo SQLAlchemy: só o já carregado (sem lazy load)
            return _valor(
                {k: x for k, x in estado.dict.items() if not k.startswith("_")},
                profundidade + 1,
            )
        return f"<{type(v).__name__}>"
    except Exception:  # noqa: BLE001 - nunca atrapalha a função instrumentada
        return f"<{type(v).__name__}>"


def _texto(v) -> str:
    v = _valor(v)
    return (v if isinstance(v, str) else str(v))[:_MAX_TEXTO]


def _gravar(span, prefixo: str, valores: dict, ja: int) -> int:
    for nome, v in valores.items():
        if ja >= _MAX_ATRIBUTOS:
            break
        if nome in ("self", "cls") or nome.startswith("__"):
            continue
        texto = "***" if _SENSIVEL.search(nome) else _texto(v)
        span.set_attribute(f"{prefixo}.{nome}", texto)
        ja += 1
    return ja


def _ao_iniciar(code: types.CodeType, _offset: int) -> None:
    if _ocupado.get() or _tracer is None:
        return
    nome, args = _alvos[code]
    marca = _ocupado.set(True)
    try:
        span = _tracer.start_span(
            nome,
            attributes={
                "code.function.name": code.co_qualname,
                "code.file.path": code.co_filename,
                "code.line.number": code.co_firstlineno,
            },
        )
        _gravar(
            span, "code.args", {a: sys._getframe(1).f_locals.get(a) for a in args}, 0
        )
        token = otel_context.attach(trace.set_span_in_context(span))
        _pilha.set(_pilha.get() + ((code, span, token),))
    finally:
        _ocupado.reset(marca)


def _finalizar(code: types.CodeType, frame, retorno, erro) -> None:
    pilha = _pilha.get()
    if _ocupado.get() or not pilha or pilha[-1][0] is not code:
        return  # função iniciada antes da instalação, ou par desencontrado
    _, span, token = pilha[-1]
    marca = _ocupado.set(True)
    try:
        _pilha.set(pilha[:-1])
        args = _alvos[code][1]
        locais = {k: v for k, v in frame.f_locals.items() if k not in args}
        ja = _gravar(span, "code.vars", locais, 0)
        if erro is None:
            if retorno is not None:
                _gravar(span, "code", {"return": retorno}, ja)
        else:
            span.record_exception(erro)
            span.set_status(Status(StatusCode.ERROR, type(erro).__name__))
        otel_context.detach(token)
        span.end()
    finally:
        _ocupado.reset(marca)


def _ao_retornar(code, _offset, retorno) -> None:
    _finalizar(code, sys._getframe(1), retorno, None)


def _ao_desenrolar(code, _offset, erro) -> None:
    if code not in _alvos:
        return
    _finalizar(code, sys._getframe(1), None, erro)


def _codigos(objeto, modulo: str):
    """Códigos das funções definidas em `modulo` (inclusive métodos e funções aninhadas)."""
    if isinstance(objeto, staticmethod | classmethod):
        objeto = objeto.__func__
    elif isinstance(objeto, property):
        for f in (objeto.fget, objeto.fset, objeto.fdel):
            if f is not None:
                yield from _codigos(f, modulo)
        return
    if isinstance(objeto, types.FunctionType):
        if objeto.__module__ == modulo:
            yield from _expandir(objeto.__code__)
    elif isinstance(objeto, type) and objeto.__module__ == modulo:
        for membro in vars(objeto).values():
            yield from _codigos(membro, modulo)


def _expandir(code: types.CodeType):
    yield code
    for c in code.co_consts:
        if isinstance(c, types.CodeType):
            yield from _expandir(c)


def _args(code: types.CodeType) -> tuple[str, ...]:
    n = code.co_argcount + code.co_kwonlyargcount
    n += bool(code.co_flags & 0x04) + bool(code.co_flags & 0x08)  # *args / **kwargs
    return code.co_varnames[:n]


def instalar(tracer: Tracer, prefixo: str = "src.") -> int:
    """Instrumenta as funções dos módulos `prefixo*` já importados. Devolve quantas."""
    global _tracer
    try:
        _mon.use_tool_id(_TOOL_ID, "incubatorium-funcoes")
    except ValueError:
        return 0  # outra ferramenta (ex.: coverage) já usa este id
    _tracer = tracer
    _mon.register_callback(_TOOL_ID, _mon.events.PY_START, _ao_iniciar)
    _mon.register_callback(_TOOL_ID, _mon.events.PY_RETURN, _ao_retornar)
    _mon.register_callback(_TOOL_ID, _mon.events.PY_UNWIND, _ao_desenrolar)

    for nome_modulo, modulo in list(sys.modules.items()):
        if not nome_modulo.startswith(prefixo) or nome_modulo.startswith(_IGNORADOS):
            continue
        for objeto in list(vars(modulo).values()):
            for code in _codigos(objeto, nome_modulo):
                if (
                    code.co_flags & _GERADORES
                    or code.co_name.startswith("<")
                    or not code.co_filename.startswith(
                        _RAIZ
                    )  # `wraps` copia o __module__
                ):
                    continue
                _alvos[code] = (f"{nome_modulo}.{code.co_qualname}", _args(code))
    for code in _alvos:
        _mon.set_local_events(_TOOL_ID, code, _EVENTOS_LOCAIS)
    _mon.set_events(_TOOL_ID, _EVENTO_GLOBAL)
    return len(_alvos)


def desinstalar() -> None:
    global _tracer
    for code in _alvos:
        _mon.set_local_events(_TOOL_ID, code, 0)
    _alvos.clear()
    _tracer = None
    if _mon.get_tool(_TOOL_ID) == "incubatorium-funcoes":
        _mon.set_events(_TOOL_ID, 0)
    if _mon.get_tool(_TOOL_ID) == "incubatorium-funcoes":
        _mon.clear_tool_id(_TOOL_ID)
        _mon.free_tool_id(_TOOL_ID)
