from fastapi import Request
from src.domain.schemas.auditoria_schema import OrigemRequisicao


def origem_da_requisicao(request: Request | None) -> OrigemRequisicao:
    """IP e user-agent do cliente.

    Atrás do nginx (`frontend/nginx.conf`) o IP real chega em `X-Real-IP`; sem ele, usa o
    endereço da conexão. O cabeçalho só é confiável com o backend exposto apenas via proxy.
    """
    if request is None:
        return OrigemRequisicao()
    ip = request.headers.get("x-real-ip") or (
        request.client.host if request.client else None
    )
    agente = request.headers.get("user-agent")
    return OrigemRequisicao(
        ip=ip[:45] if ip else None, user_agent=agente[:512] if agente else None
    )
