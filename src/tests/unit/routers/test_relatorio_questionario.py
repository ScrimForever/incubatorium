"""PDF do plano de negócio: `GET /relatorios/questionario/{id}`."""

import io
import re
from datetime import UTC, datetime

import pytest
from pypdf import PdfReader

from src.domain.models.questionario import Questionario, StatusEnum
from src.routers.relatorios import router
from src.services.pdf.html_editor import html_do_editor
from src.services.questionario.plano_pdf import gerar_pdf_plano

LONGO = "<p>" + "Texto bem longo para quebrar de página. " * 400 + "</p>"
JSON_COMPLETO = {
    "1": {
        "nome_proponente": "Ana Souza",
        "nome_negocio": "Ação & Cia Ltda",
        "setor_atuacao": "Alimentação saudável e tecnologia para nutrição",
        "cnpj": "12.345.678/0001-90",
    },
    "2": {
        "business_canvas": (
            '<h2 class="ql-align-center">Proposta</h2>'
            "<p><strong>Forte</strong>, <em>itálico</em>, <u>sub</u>, <s>riscado</s> "
            '<span style="color: red">colorido</span> <a href="https://x.com">link</a></p>'
            '<ol><li data-list="bullet">item com marcador</li>'
            '<li data-list="ordered">item numerado</li>'
            '<li data-list="checked">tarefa feita</li></ol>'
            "<blockquote>citação</blockquote>"
        ),
        "avaliacao": {"avaliador": "cons@example.com", "nota": 4, "comentario": "Bom"},
    },
    "3": {"sumario_executivo": LONGO},
    "4": {
        "equipe": [
            {
                "nome": "Bia",
                "formacao_academica": "Nutrição",
                "experiencia": "5 anos",
                "email": "bia@example.com",
                "telefone": "(22) 99999-0000",
            }
        ]
    },
    "6": {
        "fornecedores": "texto puro\nsegunda linha",
        "arquivos": [
            {"nome": "mercado.pdf", "tipo": "application/pdf", "tamanho": 2048}
        ],
    },
    "9": {"observacoes": "", "arquivos": []},
}


def _texto_do_pdf(pdf: bytes) -> str:
    return "\n".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf)).pages)


def _questionario(json_questionario, **extra) -> Questionario:
    return Questionario(
        usuario_email="ana@example.com",
        status_questionario=StatusEnum.aprovado,
        json_questionario=json_questionario,
        criado_por="ana@example.com",
        **extra,
    )


def test_pdf_traz_identificacao_etapas_equipe_anexos_avaliacao_e_decisao():
    questionario = _questionario(
        JSON_COMPLETO,
        id=7,
        criado_em=datetime(2026, 11, 1, tzinfo=UTC),
        decidido_por="adm@example.com",
        decidido_em=datetime(2026, 11, 10, 15, 0, tzinfo=UTC),
        motivo_decisao="Plano consistente.",
    )
    pdf = gerar_pdf_plano(
        questionario,
        {
            "ana@example.com": "Ana Souza",
            "cons@example.com": "Carlos Lima",
            "adm@example.com": "Dora Admin",
        },
        "cons@example.com",
        datetime(2026, 11, 19, tzinfo=UTC),
    )

    leitor = PdfReader(io.BytesIO(pdf))
    assert len(leitor.pages) > 2  # o texto longo quebra de página
    pagina = leitor.pages[0].mediabox
    assert (round(float(pagina.width)), round(float(pagina.height))) == (595, 842)
    texto = _texto_do_pdf(pdf)
    for esperado in (
        "Plano de negócio",
        "Questionário nº 7 · Aprovado",
        "Ação & Cia Ltda",
        "Responsável: Ana Souza",
        "12.345.678/0001-90",
        "Business Model Canvas",
        "Forte",
        "item com marcador",
        "item numerado",
        "[x] tarefa feita",
        "citação",
        "Avaliação: 4 · Muito Bom",
        "por Carlos Lima",
        "Bia",
        "bia@example.com",
        "texto puro",
        "segunda linha",
        "mercado.pdf",
        "(2.0 KB)",
        "Não preenchido.",
        "Decisão da coordenação",
        "em 10/11/2026 12:00 por Dora Admin",  # UTC-3
        "Plano consistente.",
    ):
        assert esperado in texto, esperado
    assert "colorido" in texto  # a cor é descartada, o texto fica


def test_pdf_de_questionario_vazio_nao_quebra():
    texto = _texto_do_pdf(
        gerar_pdf_plano(
            _questionario(None, id=2, criado_em=datetime(2026, 11, 1, tzinfo=UTC)),
            {},
            "adm@example.com",
            datetime(2026, 11, 19, tzinfo=UTC),
        )
    )

    assert "Negócio sem nome" in texto
    assert "Responsável: ana@example.com" in texto  # sem nome cadastrado
    assert "Nenhum integrante informado." in texto
    assert "Decisão da coordenação" not in texto


def test_html_do_editor_converte_listas_do_quill_e_descarta_o_resto():
    assert (
        html_do_editor(
            '<ol><li data-list="bullet">a</li><li data-list="ordered">b</li></ol>'
            '<p><span class="ql-size-huge">x</span><script>alert(1)</script>'
            '<a href="javascript:alert(1)">j</a></p>'
        )
        == "<ul><li>a</li></ul><ol><li>b</li></ol><p>xj</p>"
    )
    assert html_do_editor("a < b\nc") == "<p>a &lt; b</p><p>c</p>"
    assert html_do_editor("  ") == ""


@pytest.mark.asyncio
@pytest.mark.parametrize("perfil", ["colaborador", "incubado"])
async def test_quem_nao_e_consultor_nem_admin_recebe_403(
    perfil, criar_usuario, cliente_api
):
    cliente = await cliente_api([router], await criar_usuario(perfil))

    assert (await cliente.get("/relatorios/questionario/1")).status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("perfil", ["consultor", "admin"])
async def test_consultor_e_admin_baixam_o_pdf_pelo_id(
    perfil, criar_usuario, cliente_api, async_db
):
    dono = await criar_usuario("incubado", "ana@example.com")
    dono.nome, dono.sobrenome = "Ana", "Souza"
    questionario = _questionario(JSON_COMPLETO)
    async_db.add(questionario)
    await async_db.commit()
    cliente = await cliente_api([router], await criar_usuario(perfil))

    resposta = await cliente.get(f"/relatorios/questionario/{questionario.id}")

    assert resposta.status_code == 200
    assert resposta.headers["content-type"] == "application/pdf"
    assert re.fullmatch(
        r'attachment; filename="plano-acao-cia-ltda-\d{4}-\d{2}-\d{2}\.pdf"',
        resposta.headers["content-disposition"],
    )
    texto = _texto_do_pdf(resposta.content)
    assert "Responsável: Ana Souza" in texto


@pytest.mark.asyncio
async def test_id_inexistente_responde_404(criar_usuario, cliente_api):
    cliente = await cliente_api([router], await criar_usuario("consultor"))

    assert (await cliente.get("/relatorios/questionario/999")).status_code == 404


def _sem_espacos(texto: str) -> str:
    return re.sub(r"\s+", "", texto)


def test_textos_longos_aparecem_inteiros_sem_corte():
    """Todo valor variável cabe no espaço dele: pode quebrar linha, nunca ser cortado."""
    longo = {
        "dono": "Maria Eduarda Albuquerque Vasconcelos Nascimento de Figueiredo",
        "avaliador": "Carlos Leonardo Bittencourt Cavalcanti Montenegro Damasceno",
        "proponente": "Ana Beatriz Montenegro Vasconcelos Carvalho Bittencourt Esteves",
        "negocio": "Plataforma de rastreabilidade e inteligência de dados para cooperativas",
        "setor": "Agronegócio sustentável, biotecnologia e logística regional integrada",
        "membro": "Juliana Helena Cavalcanti Nascimento Carvalho Figueiredo Esteves",
        "email": "juliana.helena.cavalcanti.nascimento.carvalho@incubadora-exemplo.com.br",
        "anexo": "Analise_completa_de_mercado_fornecedores_concorrentes_regionais_v12.pdf",
    }
    gerado_por = (
        "coordenacao.geral.de.empreendedorismo.e.inovacao@incubadora-exemplo.com.br"
    )
    questionario = _questionario(
        {
            "1": {
                "nome_proponente": longo["proponente"],
                "nome_negocio": longo["negocio"],
                "setor_atuacao": longo["setor"],
                "cnpj": "12.345.678/0001-90",
            },
            "4": {
                "equipe": [{"nome": longo["membro"], "email": longo["email"]}],
                "avaliacao": {"avaliador": "av@example.com", "nota": 2},
            },
            "6": {"arquivos": [{"nome": longo["anexo"], "tamanho": 10}]},
        },
        id=3,
        criado_em=datetime(2026, 11, 1, tzinfo=UTC),
    )

    texto = _sem_espacos(
        _texto_do_pdf(
            gerar_pdf_plano(
                questionario,
                {
                    "ana@example.com": longo["dono"],
                    "av@example.com": longo["avaliador"],
                },
                gerado_por,
                datetime(2026, 11, 19, tzinfo=UTC),
            )
        )
    )

    assert "…" not in texto
    for valor in [*longo.values(), gerado_por]:
        assert _sem_espacos(valor) in texto, valor
