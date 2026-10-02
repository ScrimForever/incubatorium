import mimetypes
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.models.questionarios.arquivos import nova_referencia
from src.domain.models.user_model import current_active_user
from src.infra.config import settings
from src.infra.db import User, get_async_session
from src.logger import logger
from src.services.arquivos.arquivos_service import ArquivosService
from src.shared.armazenamento import (
    UPLOAD_DIR,
    caminho_etapa,
    caminho_relativo,
    sanitizar_email,
)
from src.shared.exceptions import (
    ArquivoNaoEncontradoError,
    ErroAoFazerDownloadError,
    ErroAoListarArquivosError,
    ErroAoSalvarArquivoError,
)
from src.shared.permissoes import pode_acessar_incubado
from src.shared.validacao_arquivos import (
    BYTES_ASSINATURA,
    ArquivoInvalidoError,
    nome_seguro,
    validar_conteudo,
    validar_extensao,
    validar_tamanho,
)

UPLOAD_DIR.mkdir(exist_ok=True)
CHUNK_SIZE = 1024 * 1024  # 1MB


class BaixarArquivo(BaseModel):
    nome_arquivo: str


class ArquivosRouter:
    def __init__(self, app: FastAPI) -> None:
        self.app = app
        self.router = APIRouter(prefix="/arquivos", tags=["arquivos"])
        self.app.include_router(self.router)

    @staticmethod
    def _sanitizar_email(email: str) -> str:
        return sanitizar_email(email)

    def _caminho_usuario(self, email: str, aba: int) -> Path:
        return caminho_etapa(email, aba)

    @staticmethod
    def _apagar(caminhos: list[Path]) -> None:
        for caminho in caminhos:
            caminho.unlink(missing_ok=True)

    def _listar_arquivos(self, caminho: Path) -> list[str]:
        if not caminho.exists():
            return []
        return [p.name for p in caminho.iterdir() if p.is_file()]

    @staticmethod
    async def _dono_dos_arquivos(
        db: AsyncSession, user: User, email: str | None
    ) -> str:
        """Dono dos anexos: o próprio usuário, ou o incubado `email` para a equipe."""
        if email is None or email == user.email:
            return user.email
        if not await pode_acessar_incubado(db, user, email):
            raise HTTPException(status_code=403, detail="Sem permissão.")
        return email

    async def iniciar(self) -> None:

        @self.router.post("/questionario/{aba}")
        async def inserir_arquivo_questionario(
            aba: int,
            arquivos: list[UploadFile] = File(...),
            user: User = Depends(current_active_user),
            db: AsyncSession = Depends(get_async_session),
        ):
            servico = ArquivosService(db)
            await servico.verificar_edicao(user.email, aba)
            try:
                caminho_usuario = self._caminho_usuario(user.email, aba)
                caminho_usuario.mkdir(parents=True, exist_ok=True)
            except OSError as e:
                raise HTTPException(
                    status_code=500,
                    detail="Erro ao criar diretório de upload",
                ) from e

            maximo = settings.upload_tamanho_maximo_mb * 1024 * 1024
            nome_arquivos = []
            gravados: list[Path] = []
            for arquivo in arquivos:
                caminho = None
                try:
                    nome = nome_seguro(arquivo.filename)
                    extensao = validar_extensao(nome)
                    caminho = caminho_usuario / nome
                    gravados.append(caminho)
                    tamanho = 0
                    async with aiofiles.open(caminho, "wb") as buffer:
                        while chunk := await arquivo.read(CHUNK_SIZE):
                            if tamanho == 0:
                                validar_conteudo(
                                    nome, extensao, chunk[:BYTES_ASSINATURA]
                                )
                            tamanho += len(chunk)
                            validar_tamanho(nome, tamanho, maximo)
                            await buffer.write(chunk)
                    if tamanho == 0:
                        raise ArquivoInvalidoError(nome, "arquivo vazio")
                    nome_arquivos.append(
                        {
                            "nome": nome,
                            "content_type": arquivo.content_type,
                            "tamanho": tamanho,
                            "caminho": caminho_relativo(user.email, aba, nome),
                        }
                    )
                except ArquivoInvalidoError as e:
                    self._apagar(gravados)
                    logger.warning(f"Anexo recusado: {e}")
                    raise HTTPException(status_code=422, detail=str(e)) from e
                except OSError as e:
                    self._apagar(gravados)
                    logger.error(f"Erro ao salvar arquivo {arquivo.filename}: {e}")
                    raise ErroAoSalvarArquivoError(arquivo.filename, str(e)) from e

            try:
                await servico.registrar(
                    user.email,
                    aba,
                    [
                        nova_referencia(
                            user.email, aba, a["nome"], a["content_type"], a["tamanho"]
                        )
                        for a in nome_arquivos
                    ],
                )
            except Exception:
                self._apagar(gravados)
                raise

            return {"arquivos_recebidos": nome_arquivos}

        @self.router.get("/questionario/nome-arquivo/{aba}")
        async def listar_arquivos_aba_questionario(
            aba: int,
            email: str | None = None,
            user: User = Depends(current_active_user),
            db: AsyncSession = Depends(get_async_session),
        ):
            dono = await self._dono_dos_arquivos(db, user, email)
            try:
                caminho_usuario = self._caminho_usuario(dono, aba)
                return self._listar_arquivos(caminho_usuario)
            except OSError as e:
                logger.error(f"Erro ao listar arquivos: {e}")
                raise ErroAoListarArquivosError(str(caminho_usuario), str(e)) from e

        @self.router.post("/questionario/download/{aba}/{todos}")
        async def baixar_arquivos_aba_questionario(
            nome: BaixarArquivo,
            aba: int,
            todos: int | None = None,
            email: str | None = None,
            user: User = Depends(current_active_user),
            db: AsyncSession = Depends(get_async_session),
        ):
            dono = await self._dono_dos_arquivos(db, user, email)
            try:
                if todos:
                    pass

                caminho_usuario = self._caminho_usuario(dono, aba)
                caminho = caminho_usuario / nome_seguro(nome.nome_arquivo)

                if not caminho.exists():
                    raise ArquivoNaoEncontradoError(nome.nome_arquivo)

                media_type = mimetypes.guess_type(nome.nome_arquivo)[0]

                return FileResponse(
                    path=caminho,
                    filename=nome.nome_arquivo,
                    media_type=media_type,
                )
            except ArquivoNaoEncontradoError as e:
                logger.warning(f"Arquivo não encontrado: {e}")
                raise HTTPException(status_code=404, detail=str(e)) from e
            except OSError as e:
                logger.error(f"Erro ao fazer download: {e}")
                raise ErroAoFazerDownloadError(nome.nome_arquivo, str(e)) from e

        @self.router.delete("/questionario/{aba}")
        async def listar_arquivos_questionario(
            delecao: list[str],
            aba: int,
            user: User = Depends(current_active_user),
            db: AsyncSession = Depends(get_async_session),
        ):
            servico = ArquivosService(db)
            await servico.verificar_edicao(user.email, aba)
            try:
                caminho_usuario = self._caminho_usuario(user.email, aba)
                arquivos_existentes = set(self._listar_arquivos(caminho_usuario))
            except OSError as e:
                logger.error(f"Erro ao listar arquivos para exclusão: {e}")
                raise ErroAoListarArquivosError(str(caminho_usuario), str(e)) from e

            deletados = []
            erros = []

            for nome_arquivo in delecao:
                if nome_arquivo not in arquivos_existentes:
                    erros.append(
                        {
                            "arquivo": nome_arquivo,
                            "erro": "Arquivo não encontrado",
                        }
                    )
                    continue

                try:
                    (caminho_usuario / nome_arquivo).unlink()
                    deletados.append(nome_arquivo)
                except OSError as e:
                    logger.error(f"Erro ao deletar {nome_arquivo}: {e}")
                    erros.append(
                        {
                            "arquivo": nome_arquivo,
                            "erro": str(e),
                        }
                    )

            # referências de arquivos listados, mesmo os que já não existem em disco
            sumidos = [
                e["arquivo"] for e in erros if e["erro"] == "Arquivo não encontrado"
            ]
            await servico.remover(user.email, aba, deletados + sumidos)

            return {
                "arquivos_deletados": deletados,
                "erros": erros if erros else None,
            }
