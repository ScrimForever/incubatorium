import mimetypes
import os
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, FastAPI, File, UploadFile
from fastapi.responses import FileResponse
from loguru import logger
from pydantic import BaseModel
from src.domain.models.user_model import current_active_user
from src.infra.db import User

UPLOAD_DIR = "questionarios"
os.makedirs(UPLOAD_DIR, exist_ok=True)

CHUNK_SIZE = 1024 * 1024  # 1MB


class BaixarArquivo(BaseModel):
    nome_arquivo: str


class ArquivosRouter:
    def __init__(self, app):
        self.app: FastAPI = app
        self.router = APIRouter(prefix="/arquivos", tags=["arquivos"])
        self.app.include_router(self.router)

    async def iniciar(self):

        @self.router.post("/questionario/{aba}")
        async def inserir_arquivo_questionario(
            aba: int,
            arquivos: list[UploadFile] = File(...),
            user: User = Depends(current_active_user),
        ):
            nome_arquivos = []
            for arquivo in arquivos:
                try:
                    os.makedirs(
                        f"{UPLOAD_DIR}/{user.email.replace('@', '').replace('.', '')}/{aba}",
                        exist_ok=True,
                    )
                except OSError as e:
                    logger.error(e)

                caminho_usuario = (
                    UPLOAD_DIR
                    + f"/{user.email.replace('@', '').replace('.', '')}/{aba}"
                )
                caminho = os.path.join(caminho_usuario, arquivo.filename)
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
            return {"arquivos_recebidos": nome_arquivos}

        @self.router.get("/questionario/nome-arquivo/{aba}")
        async def listar_arquivos_aba_questionario(
            aba: int,
            user: User = Depends(current_active_user),
        ):
            files = [
                p.name.split("/")[-1]
                for p in Path(
                    f"{UPLOAD_DIR}/{user.email.replace('@', '').replace('.', '')}/{aba}"
                ).iterdir()
                if p.is_file()
            ]
            return files

        @self.router.get("/questionario/download/{aba}")
        async def baixar_arquivos_aba_questionario(
            aba: int,
            nome: BaixarArquivo,
            user: User = Depends(current_active_user),
        ):
            nome_arquivo = nome.model_dump().get("nome_arquivo")
            caminho = f"{UPLOAD_DIR}/{user.email.replace('@', '').replace('.', '')}/{aba}/{nome_arquivo}"
            return FileResponse(
                path=caminho,
                filename=nome_arquivo,
                media_type=mimetypes.guess_type(nome_arquivo)[0],
            )

        @self.router.delete("/questionario/{aba}")
        async def listar_arquivos_questionario(
            delecao: list[str],
            aba: int,
            user: User = Depends(current_active_user),
        ):
            files = [
                p
                for p in Path(
                    f"{UPLOAD_DIR}/{user.email.replace('@', '').replace('.', '')}/{aba}"
                ).iterdir()
                if p.is_file()
            ]
            return files
