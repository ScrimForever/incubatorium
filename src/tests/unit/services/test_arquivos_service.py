import io

import pytest

from domain.models.questionario import Questionario, StatusEnum
from infra.armazenamento import ArmazenamentoLocal, sanitizar_email
from repository.questionario import QuestionarioRepository
from services.arquivos.arquivos_service import ArquivosService
from shared.exceptions import ConflitoError, NaoEncontradoError
from shared.validacao_arquivos import ArquivoInvalidoError

EMAIL = "ana@example.com"


def _service(async_db) -> ArquivosService:
    return ArquivosService(QuestionarioRepository(async_db), ArmazenamentoLocal())


@pytest.fixture
def criar(async_db):
    async def _criar(status=StatusEnum.pendente, json=None):
        async_db.add(
            Questionario(
                usuario_email=EMAIL,
                status_questionario=status,
                json_questionario=json or {},
                criado_por=EMAIL,
            )
        )
        await async_db.commit()

    return _criar


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status", [StatusEnum.iniciado, StatusEnum.pendente, StatusEnum.aprovado]
)
async def test_estados_editaveis(async_db, criar, status):
    await criar(status)
    assert await _service(async_db).verificar_edicao(EMAIL)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status", [StatusEnum.aguardando_aprovacao, StatusEnum.rejeitado]
)
async def test_estados_nao_editaveis_da_conflito(async_db, criar, status):
    await criar(status)
    with pytest.raises(ConflitoError):
        await _service(async_db).verificar_edicao(EMAIL)


@pytest.mark.asyncio
async def test_sem_questionario_da_nao_encontrado(async_db):
    with pytest.raises(NaoEncontradoError):
        await _service(async_db).verificar_edicao(EMAIL)


class _Upload:
    def __init__(self, filename, conteudo, content_type="application/octet-stream"):
        self.filename = filename
        self.content_type = content_type
        self._conteudo = io.BytesIO(conteudo)

    async def read(self, n=-1):
        return self._conteudo.read(n)


def _service_disco(async_db, tmp_path) -> ArquivosService:
    return ArquivosService(QuestionarioRepository(async_db), ArmazenamentoLocal(tmp_path))


PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"


@pytest.mark.asyncio
async def test_receber_grava_pdf_valido(async_db, tmp_path):
    servico = _service_disco(async_db, tmp_path)
    [recebido] = await servico.receber(EMAIL, 6, [_Upload("a.pdf", PDF, "application/pdf")])
    assert recebido["nome"] == "a.pdf"
    assert recebido["content_type"] == "application/pdf"
    assert recebido["tamanho"] == len(PDF)
    assert recebido["caminho"] == f"{sanitizar_email(EMAIL)}/6/a.pdf"
    assert servico.listar(EMAIL, 6) == ["a.pdf"]


@pytest.mark.asyncio
async def test_receber_arquivo_vazio_e_recusado(async_db, tmp_path):
    with pytest.raises(ArquivoInvalidoError):
        await _service_disco(async_db, tmp_path).receber(
            EMAIL, 6, [_Upload("a.txt", b"")]
        )


@pytest.mark.asyncio
async def test_receber_extensao_fora_da_lista_e_recusada(async_db, tmp_path):
    with pytest.raises(ArquivoInvalidoError):
        await _service_disco(async_db, tmp_path).receber(
            EMAIL, 6, [_Upload("a.exe", b"MZ")]
        )


@pytest.mark.asyncio
async def test_segundo_invalido_apaga_o_primeiro_ja_gravado(async_db, tmp_path):
    servico = _service_disco(async_db, tmp_path)
    with pytest.raises(ArquivoInvalidoError):
        await servico.receber(
            EMAIL, 6, [_Upload("ok.pdf", PDF), _Upload("falso.pdf", b"nao e pdf")]
        )
    assert servico.listar(EMAIL, 6) == []


@pytest.mark.asyncio
async def test_apagar_inexistente_vai_para_erros(async_db, tmp_path):
    servico = _service_disco(async_db, tmp_path)
    await servico.receber(EMAIL, 6, [_Upload("a.pdf", PDF)])
    resultado = await servico.apagar(EMAIL, 6, ["a.pdf", "x.pdf"])
    assert resultado == {
        "arquivos_deletados": ["a.pdf"],
        "erros": [{"arquivo": "x.pdf", "erro": "Arquivo não encontrado"}],
    }
    assert (await servico.apagar(EMAIL, 6, []))["erros"] is None
