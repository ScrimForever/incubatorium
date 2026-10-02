import pytest
from fastapi import FastAPI
from sqlalchemy import select

from domain.models.questionarios.questionario import Questionario, StatusEnum
from infra.config import settings
from routers.arquivos.r_arquivos import ArquivosRouter
from shared import armazenamento
from shared.handlers import registrar_handlers

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


@pytest.fixture(autouse=True)
def _pasta_temporaria(tmp_path, monkeypatch):
    monkeypatch.setattr(armazenamento, "UPLOAD_DIR", tmp_path)
    return tmp_path


@pytest.fixture
def criar_questionario(async_db):
    async def _criar(email, status=StatusEnum.pendente, json=None):
        async_db.add(
            Questionario(
                usuario_email=email,
                status_questionario=status,
                json_questionario=json or {},
                criado_por=email,
            )
        )
        await async_db.commit()

    return _criar


@pytest.fixture
def criar_usuario(criar_usuario, criar_questionario):
    """Incubados nascem com questionário pendente (anexos exigem um questionário)."""

    async def _criar(perfil="incubado", email=None, com_questionario=True):
        usuario = await criar_usuario(perfil, email)
        if perfil == "incubado" and com_questionario:
            await criar_questionario(usuario.email)
        return usuario

    return _criar


@pytest.fixture
async def api(async_db):
    """Cliente do router de arquivos, com o usuário informado na chamada."""

    async def _montar(usuario):
        import httpx

        from domain.models.user_model import current_active_user
        from infra.db import get_async_session

        app = FastAPI()
        registrar_handlers(app)
        roteador = ArquivosRouter(app)
        await roteador.iniciar()

        async def _usuario():
            return usuario

        async def _sessao():
            return async_db

        app.dependency_overrides[current_active_user] = _usuario
        app.dependency_overrides[get_async_session] = _sessao
        return httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        )

    return _montar


def _envio(nome, conteudo, tipo="application/octet-stream"):
    return [("arquivos", (nome, conteudo, tipo))]


class TestUpload:
    @pytest.mark.asyncio
    async def test_aceita_pdf_valido_e_grava_no_disco(
        self, criar_usuario, api, _pasta_temporaria
    ):
        usuario = await criar_usuario("incubado", "ana@example.com")
        cliente = await api(usuario)

        resposta = await cliente.post(
            "/arquivos/questionario/6", files=_envio("balanco.pdf", PDF)
        )

        assert resposta.status_code == 200
        [recebido] = resposta.json()["arquivos_recebidos"]
        assert recebido["nome"] == "balanco.pdf"
        assert recebido["tamanho"] == len(PDF)
        assert (
            _pasta_temporaria / "anaexamplecom" / "6" / "balanco.pdf"
        ).read_bytes() == PDF
        assert recebido["caminho"] == "anaexamplecom/6/balanco.pdf"

    @pytest.mark.asyncio
    async def test_extensao_nao_permitida_da_422(self, criar_usuario, api):
        cliente = await api(await criar_usuario("incubado"))

        resposta = await cliente.post(
            "/arquivos/questionario/6", files=_envio("malware.exe", b"MZ\x90\x00")
        )

        assert resposta.status_code == 422
        assert "tipo não permitido" in resposta.json()["detail"]

    @pytest.mark.asyncio
    async def test_conteudo_diferente_da_extensao_da_422_e_nao_deixa_arquivo(
        self, criar_usuario, api, _pasta_temporaria
    ):
        usuario = await criar_usuario("incubado", "ana@example.com")
        cliente = await api(usuario)

        resposta = await cliente.post(
            "/arquivos/questionario/6",
            files=_envio("falso.pdf", b"#!/bin/sh\nrm -rf /\n"),
        )

        assert resposta.status_code == 422
        assert "conteúdo" in resposta.json()["detail"]
        assert not (_pasta_temporaria / "anaexamplecom" / "6" / "falso.pdf").exists()

    @pytest.mark.asyncio
    async def test_png_com_extensao_pdf_e_recusado(self, criar_usuario, api):
        cliente = await api(await criar_usuario("incubado"))

        resposta = await cliente.post(
            "/arquivos/questionario/6", files=_envio("imagem.pdf", PNG)
        )

        assert resposta.status_code == 422

    @pytest.mark.asyncio
    async def test_nome_com_caminho_e_reduzido_ao_nome_base(
        self, criar_usuario, api, _pasta_temporaria
    ):
        usuario = await criar_usuario("incubado", "ana@example.com")
        cliente = await api(usuario)

        resposta = await cliente.post(
            "/arquivos/questionario/6", files=_envio("../../../fuga.pdf", PDF)
        )

        assert resposta.status_code == 200
        assert (_pasta_temporaria / "anaexamplecom" / "6" / "fuga.pdf").exists()
        assert not (_pasta_temporaria.parent / "fuga.pdf").exists()

    @pytest.mark.asyncio
    async def test_arquivo_acima_do_limite_da_422_e_e_removido(
        self, criar_usuario, api, monkeypatch, _pasta_temporaria
    ):
        monkeypatch.setattr(settings, "upload_tamanho_maximo_mb", 0)
        usuario = await criar_usuario("incubado", "ana@example.com")
        cliente = await api(usuario)

        resposta = await cliente.post(
            "/arquivos/questionario/6", files=_envio("grande.pdf", PDF)
        )

        assert resposta.status_code == 422
        assert "limite" in resposta.json()["detail"]
        assert not (_pasta_temporaria / "anaexamplecom" / "6" / "grande.pdf").exists()

    @pytest.mark.asyncio
    async def test_arquivo_vazio_da_422(self, criar_usuario, api):
        cliente = await api(await criar_usuario("incubado"))

        resposta = await cliente.post(
            "/arquivos/questionario/6", files=_envio("vazio.txt", b"")
        )

        assert resposta.status_code == 422

    @pytest.mark.asyncio
    async def test_texto_puro_e_aceito_e_binario_como_txt_nao(self, criar_usuario, api):
        cliente = await api(await criar_usuario("incubado"))

        texto = await cliente.post(
            "/arquivos/questionario/9", files=_envio("notas.txt", "olá".encode())
        )
        binario = await cliente.post(
            "/arquivos/questionario/9", files=_envio("lixo.txt", b"abc\x00def")
        )

        assert texto.status_code == 200
        assert binario.status_code == 422


class TestLeituraPelaEquipe:
    @pytest.mark.asyncio
    async def test_dono_lista_e_baixa_os_proprios_arquivos(self, criar_usuario, api):
        usuario = await criar_usuario("incubado", "ana@example.com")
        cliente = await api(usuario)
        await cliente.post("/arquivos/questionario/6", files=_envio("a.pdf", PDF))

        lista = await cliente.get("/arquivos/questionario/nome-arquivo/6")
        baixar = await cliente.post(
            "/arquivos/questionario/download/6/0", json={"nome_arquivo": "a.pdf"}
        )

        assert lista.json() == ["a.pdf"]
        assert baixar.status_code == 200
        assert baixar.content == PDF

    @pytest.mark.asyncio
    async def test_colaborador_acessa_arquivos_do_incubado(self, criar_usuario, api):
        dono = await criar_usuario("incubado", "ana@example.com")
        colaborador = await criar_usuario("colaborador")
        await (await api(dono)).post(
            "/arquivos/questionario/6", files=_envio("a.pdf", PDF)
        )
        como_colaborador = await api(colaborador)

        lista = await como_colaborador.get(
            "/arquivos/questionario/nome-arquivo/6", params={"email": dono.email}
        )
        baixar = await como_colaborador.post(
            "/arquivos/questionario/download/6/0",
            params={"email": dono.email},
            json={"nome_arquivo": "a.pdf"},
        )

        assert lista.json() == ["a.pdf"]
        assert baixar.status_code == 200

    @pytest.mark.asyncio
    async def test_outro_incubado_recebe_403(self, criar_usuario, api):
        dono = await criar_usuario("incubado", "ana@example.com")
        intruso = await criar_usuario("incubado")
        resposta = await (await api(intruso)).get(
            "/arquivos/questionario/nome-arquivo/6", params={"email": dono.email}
        )
        assert resposta.status_code == 403

    @pytest.mark.asyncio
    async def test_download_nao_sai_da_pasta_do_incubado(self, criar_usuario, api):
        usuario = await criar_usuario("incubado", "ana@example.com")
        cliente = await api(usuario)

        resposta = await cliente.post(
            "/arquivos/questionario/download/6/0",
            json={"nome_arquivo": "../../../etc/passwd"},
        )

        assert resposta.status_code == 404


async def _json(async_db, email):
    await async_db.rollback()
    q = (
        await async_db.execute(
            select(Questionario).where(Questionario.usuario_email == email)
        )
    ).scalar_one()
    await async_db.refresh(q)
    return q.json_questionario


class TestReferenciasNoJson:
    @pytest.mark.asyncio
    async def test_upload_cria_referencia_e_reenvio_nao_duplica(
        self, criar_usuario, api, async_db
    ):
        usuario = await criar_usuario("incubado", "ana@example.com")
        cliente = await api(usuario)

        await cliente.post("/arquivos/questionario/6", files=_envio("a.pdf", PDF))
        await cliente.post("/arquivos/questionario/6", files=_envio("a.pdf", PDF))

        arquivos = (await _json(async_db, usuario.email))["6"]["arquivos"]
        assert arquivos == [
            {
                "nome": "a.pdf",
                "tipo": "application/octet-stream",
                "tamanho": len(PDF),
                "caminho": "anaexamplecom/6/a.pdf",
            }
        ]

    @pytest.mark.asyncio
    async def test_aba_inexistente_da_422_e_nao_grava_arquivo(
        self, criar_usuario, api, _pasta_temporaria
    ):
        cliente = await api(await criar_usuario("incubado", "ana@example.com"))

        resposta = await cliente.post(
            "/arquivos/questionario/99", files=_envio("a.pdf", PDF)
        )

        assert resposta.status_code == 422
        assert not list(_pasta_temporaria.rglob("a.pdf"))

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "status", [StatusEnum.aguardando_aprovacao, StatusEnum.rejeitado]
    )
    async def test_estado_nao_editavel_da_409_e_nao_deixa_arquivo(
        self, criar_usuario, criar_questionario, api, _pasta_temporaria, status
    ):
        usuario = await criar_usuario(
            "incubado", "ana@example.com", com_questionario=False
        )
        await criar_questionario(usuario.email, status)
        cliente = await api(usuario)

        resposta = await cliente.post(
            "/arquivos/questionario/6", files=_envio("a.pdf", PDF)
        )

        assert resposta.status_code == 409
        assert not list(_pasta_temporaria.rglob("a.pdf"))

    @pytest.mark.asyncio
    async def test_sem_questionario_da_404(self, criar_usuario, api, _pasta_temporaria):
        usuario = await criar_usuario(
            "incubado", "ana@example.com", com_questionario=False
        )
        cliente = await api(usuario)

        resposta = await cliente.post(
            "/arquivos/questionario/6", files=_envio("a.pdf", PDF)
        )

        assert resposta.status_code == 404
        assert not list(_pasta_temporaria.rglob("a.pdf"))

    @pytest.mark.asyncio
    async def test_lote_com_arquivo_invalido_nao_deixa_nenhum_arquivo(
        self, criar_usuario, api, async_db, _pasta_temporaria
    ):
        usuario = await criar_usuario("incubado", "ana@example.com")
        cliente = await api(usuario)

        resposta = await cliente.post(
            "/arquivos/questionario/6",
            files=_envio("ok.pdf", PDF) + _envio("falso.pdf", b"nao e pdf"),
        )

        assert resposta.status_code == 422
        assert not list(_pasta_temporaria.rglob("*.pdf"))
        assert "arquivos" not in (await _json(async_db, usuario.email)).get("6", {})

    @pytest.mark.asyncio
    async def test_delete_remove_arquivo_e_referencia(
        self, criar_usuario, api, async_db, _pasta_temporaria
    ):
        usuario = await criar_usuario("incubado", "ana@example.com")
        cliente = await api(usuario)
        await cliente.post(
            "/arquivos/questionario/6",
            files=_envio("a.pdf", PDF) + _envio("b.pdf", PDF),
        )

        resposta = await cliente.request(
            "DELETE", "/arquivos/questionario/6", json=["a.pdf"]
        )

        assert resposta.json()["arquivos_deletados"] == ["a.pdf"]
        assert not (_pasta_temporaria / "anaexamplecom" / "6" / "a.pdf").exists()
        json = await _json(async_db, usuario.email)
        assert [a["nome"] for a in json["6"]["arquivos"]] == ["b.pdf"]

    @pytest.mark.asyncio
    async def test_delete_remove_referencia_de_arquivo_ausente_no_disco(
        self, criar_usuario, api, async_db, _pasta_temporaria
    ):
        usuario = await criar_usuario("incubado", "ana@example.com")
        cliente = await api(usuario)
        await cliente.post("/arquivos/questionario/6", files=_envio("a.pdf", PDF))
        (_pasta_temporaria / "anaexamplecom" / "6" / "a.pdf").unlink()

        resposta = await cliente.request(
            "DELETE", "/arquivos/questionario/6", json=["a.pdf"]
        )

        assert resposta.json()["erros"][0]["erro"] == "Arquivo não encontrado"
        assert (await _json(async_db, usuario.email))["6"]["arquivos"] == []

    @pytest.mark.asyncio
    async def test_delete_em_estado_nao_editavel_da_409(
        self, criar_usuario, criar_questionario, api
    ):
        usuario = await criar_usuario(
            "incubado", "ana@example.com", com_questionario=False
        )
        await criar_questionario(usuario.email, StatusEnum.rejeitado)

        resposta = await (await api(usuario)).request(
            "DELETE", "/arquivos/questionario/6", json=["a.pdf"]
        )

        assert resposta.status_code == 409


class TestIsolamentoDeAnexos:
    @pytest.mark.asyncio
    async def test_outro_incubado_nao_anexa_nem_remove_no_questionario_alheio(
        self, criar_usuario, api, async_db, _pasta_temporaria
    ):
        ana = await criar_usuario("incubado", "ana@example.com")
        beto = await criar_usuario("incubado", "beto@example.com")
        await (await api(ana)).post(
            "/arquivos/questionario/6", files=_envio("a.pdf", PDF)
        )
        como_beto = await api(beto)

        await como_beto.post("/arquivos/questionario/6", files=_envio("b.pdf", PDF))
        await como_beto.request("DELETE", "/arquivos/questionario/6", json=["a.pdf"])

        assert (_pasta_temporaria / "anaexamplecom" / "6" / "a.pdf").exists()
        ana_json = await _json(async_db, ana.email)
        assert [a["nome"] for a in ana_json["6"]["arquivos"]] == ["a.pdf"]
        beto_json = await _json(async_db, beto.email)
        assert [a["nome"] for a in beto_json["6"]["arquivos"]] == ["b.pdf"]

    @pytest.mark.asyncio
    async def test_put_do_questionario_nao_altera_arquivos(
        self, criar_usuario, api, async_db
    ):
        from services.ingresso.ingresso_service import IngressoService

        ana = await criar_usuario("incubado", "ana@example.com")
        await (await api(ana)).post(
            "/arquivos/questionario/6", files=_envio("a.pdf", PDF)
        )
        antes = (await _json(async_db, ana.email))["6"]["arquivos"]

        from domain.schemas.questionario_schema import QuestionarioInputSchema

        entrada = QuestionarioInputSchema(
            status_questionario=StatusEnum.pendente,
            json_questionario={"6": {"fornecedores": "x", "arquivos": []}},
        )
        await IngressoService(async_db).atualizar_plano(ana, entrada)

        assert (await _json(async_db, ana.email))["6"]["arquivos"] == antes
