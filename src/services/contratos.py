"""Contratos mínimos que os services exigem de suas dependências externas.

Cada service depende só do que usa (e-mail de notificação, e-mail de cadastro, armazenamento
de anexos), não das classes concretas em `services.email` e `infra`.
"""

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Protocol


class Notificador(Protocol):
    async def enviar_notificacao(
        self, email: str, assunto: str, titulo: str, mensagem: str, detalhe: str = ""
    ) -> bool: ...


class EmailDeCadastro(Protocol):
    async def enviar_email_cadastro(self, email: str, codigo: str | None) -> bool: ...


class Armazenamento(Protocol):
    def pasta(self, email: str, aba: int) -> Path: ...
    def caminho_relativo(self, email: str, aba: int, nome: str) -> str: ...
    def preparar(self, email: str, aba: int) -> Path: ...
    def listar(self, email: str, aba: int) -> list[str]: ...
    async def gravar(
        self, email: str, aba: int, nome: str, partes: AsyncIterator[bytes]
    ) -> int: ...
    def apagar(self, email: str, aba: int, nomes: list[str]) -> None: ...
