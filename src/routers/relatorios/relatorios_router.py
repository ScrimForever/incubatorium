from fastapi import APIRouter, Depends
from fastapi.responses import Response

from src.domain.models.usuario import User
from src.routers.dependencias import get_auditoria_service, get_plano_pdf_service
from src.services.auditoria.auditoria_service import AuditoriaService
from src.services.questionario.plano_pdf_service import PlanoPdfService
from src.shared.datas import hoje_local
from src.shared.permissoes import editor_questionario_de_incubado, somente_admin

router = APIRouter(prefix="/relatorios", tags=["relatorios"])
RESPOSTA_PDF = {200: {"content": {"application/pdf": {}}}}


def _pdf(conteudo: bytes, prefixo: str) -> Response:
    nome = f"{prefixo}-{hoje_local():%Y-%m-%d}.pdf"
    return Response(
        content=conteudo,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )


@router.get("/acessos-falha", response_class=Response, responses=RESPOSTA_PDF)
async def relatorio_acessos_falha(
    admin: User = Depends(somente_admin),
    service: AuditoriaService = Depends(get_auditoria_service),
):
    """PDF com todas as tentativas de login que falharam. Restrito a admins."""
    return _pdf(await service.relatorio_acessos_falha(admin.email), "acessos-falha")


@router.get("/acessos-sucesso", response_class=Response, responses=RESPOSTA_PDF)
async def relatorio_acessos_sucesso(
    admin: User = Depends(somente_admin),
    service: AuditoriaService = Depends(get_auditoria_service),
):
    """PDF com todos os logins realizados com sucesso. Restrito a admins."""
    return _pdf(await service.relatorio_acessos_sucesso(admin.email), "acessos-sucesso")


@router.get(
    "/questionario/{questionario_id}", response_class=Response, responses=RESPOSTA_PDF
)
async def relatorio_questionario(
    questionario_id: int,
    user: User = Depends(editor_questionario_de_incubado),
    service: PlanoPdfService = Depends(get_plano_pdf_service),
):
    """PDF do plano de negócio (A4 retrato). Consultor ou admin, como `GET /questionario/{id}`."""
    prefixo, conteudo = await service.gerar(questionario_id, user.email)
    return _pdf(conteudo, prefixo)
