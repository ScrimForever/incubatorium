from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.models.usuario import User
from src.infra.db import get_async_session
from src.logger import logger
from src.routers.dependencias import get_arquivos_service
from src.services.arquivos.arquivos_service import (
    ArquivosService,
    ErroAoCriarDiretorioError,
)
from src.shared.exceptions import (
    ArquivoNaoEncontradoError,
    ErroAoFazerDownloadError,
    ErroAoListarArquivosError,
)
from src.shared.permissoes import exigir_perfil, pode_acessar_incubado
from src.shared.validacao_arquivos import ArquivoInvalidoError

router = APIRouter(prefix="/arquivos", tags=["arquivos"])


class BaixarArquivo(BaseModel):
    nome_arquivo: str


async def _dono_dos_arquivos(db: AsyncSession, user: User, email: str | None) -> str:
    """Dono dos anexos: o próprio usuário, ou o incubado `email` para a equipe."""
    if email is None or email == user.email:
        return user.email
    if not await pode_acessar_incubado(db, user, email):
        raise HTTPException(status_code=403, detail="Sem permissão.")
    return email


@router.post("/questionario/{aba}")
async def inserir_arquivo_questionario(
    aba: int,
    arquivos: list[UploadFile] = File(...),
    user: User = Depends(exigir_perfil("incubado", "consultor")),
    servico: ArquivosService = Depends(get_arquivos_service),
):
    await servico.verificar_edicao(user.email)
    try:
        recebidos = await servico.receber(user.email, aba, arquivos)
    except ErroAoCriarDiretorioError as e:
        raise HTTPException(
            status_code=500,
            detail="Erro ao criar diretório de upload",
        ) from e
    except ArquivoInvalidoError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return {"arquivos_recebidos": recebidos}


@router.get("/questionario/nome-arquivo/{aba}")
async def listar_arquivos_aba_questionario(
    aba: int,
    email: str | None = None,
    user: User = Depends(exigir_perfil("incubado", "colaborador", "consultor")),
    db: AsyncSession = Depends(get_async_session),
    servico: ArquivosService = Depends(get_arquivos_service),
):
    dono = await _dono_dos_arquivos(db, user, email)
    try:
        return servico.listar(dono, aba)
    except OSError as e:
        logger.error(f"Erro ao listar arquivos: {e}")
        pasta = servico.armazenamento.pasta(dono, aba)
        raise ErroAoListarArquivosError(str(pasta), str(e)) from e


@router.post("/questionario/download/{aba}/{todos}")
async def baixar_arquivos_aba_questionario(
    nome: BaixarArquivo,
    aba: int,
    todos: int | None = None,
    email: str | None = None,
    user: User = Depends(exigir_perfil("incubado", "colaborador", "consultor")),
    db: AsyncSession = Depends(get_async_session),
    servico: ArquivosService = Depends(get_arquivos_service),
):
    dono = await _dono_dos_arquivos(db, user, email)
    try:
        caminho = servico.caminho_download(dono, aba, nome.nome_arquivo)
        return FileResponse(
            path=caminho,
            filename=nome.nome_arquivo,
            media_type=servico.tipo_midia(nome.nome_arquivo),
        )
    except ArquivoNaoEncontradoError as e:
        logger.warning(f"Arquivo não encontrado: {e}")
        raise HTTPException(status_code=404, detail=str(e)) from e
    except OSError as e:
        logger.error(f"Erro ao fazer download: {e}")
        raise ErroAoFazerDownloadError(nome.nome_arquivo, str(e)) from e


@router.delete("/questionario/{aba}")
async def listar_arquivos_questionario(
    delecao: list[str],
    aba: int,
    user: User = Depends(exigir_perfil("incubado", "colaborador", "consultor")),
    servico: ArquivosService = Depends(get_arquivos_service),
):
    await servico.verificar_edicao(user.email)
    try:
        return await servico.apagar(user.email, aba, delecao)
    except OSError as e:
        logger.error(f"Erro ao listar arquivos para exclusão: {e}")
        pasta = servico.armazenamento.pasta(user.email, aba)
        raise ErroAoListarArquivosError(str(pasta), str(e)) from e
