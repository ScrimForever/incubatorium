import mimetypes
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from src.domain.models.user_model import current_active_user
from src.infra.db import User
from src.logger import logger
from src.shared.exceptions import (
    ArquivoNaoEncontradoError,
    ErroAoFazerDownloadError,
    ErroAoListarArquivosError,
    ErroAoSalvarArquivoError,
)

UPLOAD_DIR = Path("questionarios")
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
        return email.replace("@", "").replace(".", "")

    def _caminho_usuario(self, email: str, aba: int) -> Path:
        sanitizado = self._sanitizar_email(email)
        return UPLOAD_DIR / sanitizado / str(aba)

    def _listar_arquivos(self, caminho: Path) -> list[str]:
        if not caminho.exists():
            return []
        return [p.name for p in caminho.iterdir() if p.is_file()]

    async def iniciar(self) -> None:

        @self.router.post("/questionario/{aba}")
        async def inserir_arquivo_questionario(
            aba: int,
            arquivos: list[UploadFile] = File(...),
            user: User = Depends(current_active_user),
        ):
            try:
                caminho_usuario = self._caminho_usuario(user.email, aba)
                caminho_usuario.mkdir(parents=True, exist_ok=True)
            except OSError as e:
                raise HTTPException(
                    status_code=500,
                    detail="Erro ao criar diretório de upload",
                ) from e

            nome_arquivos = []
            for arquivo in arquivos:
                try:
                    caminho = caminho_usuario / arquivo.filename
                    tamanho = 0
                    async with aiofiles.open(caminho, "wb") as buffer:
                        while chunk := await arquivo.read(CHUNK_SIZE):
                            tamanho += len(chunk)
                            await buffer.write(chunk)
                    nome_arquivos.append(
                        {
                            "nome": arquivo.filename,
                            "content_type": arquivo.content_type,
                            "tamanho": tamanho,
                        }
                    )
                except OSError as e:
                    logger.error(f"Erro ao salvar arquivo {arquivo.filename}: {e}")
                    raise ErroAoSalvarArquivoError(arquivo.filename, str(e)) from e

            return {"arquivos_recebidos": nome_arquivos}

        @self.router.get("/questionario/nome-arquivo/{aba}")
        async def listar_arquivos_aba_questionario(
            aba: int,
            user: User = Depends(current_active_user),
        ):
            try:
                caminho_usuario = self._caminho_usuario(user.email, aba)
                return self._listar_arquivos(caminho_usuario)
            except OSError as e:
                logger.error(f"Erro ao listar arquivos: {e}")
                raise ErroAoListarArquivosError(str(caminho_usuario), str(e)) from e

        @self.router.post("/questionario/download/{aba}/{todos}")
        async def baixar_arquivos_aba_questionario(
            nome: BaixarArquivo,
            aba: int,
            todos: int | None = None,
            user: User = Depends(current_active_user),
        ):
            try:
                if todos:
                    pass

                caminho_usuario = self._caminho_usuario(user.email, aba)
                caminho = caminho_usuario / nome.nome_arquivo

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
        ):
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

            return {
                "arquivos_deletados": deletados,
                "erros": erros if erros else None,
            }
