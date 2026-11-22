"""PDF do plano de negócio (questionário), em A4 retrato, com o visual dos relatórios.

Títulos e campos espelham `frontend/src/app/pages/questionario/etapas.ts`; os textos
longos vêm do editor (HTML do Quill) e passam por `html_do_editor`.
"""

from collections.abc import Callable, Mapping
from datetime import datetime
from typing import Any

from fpdf.fonts import FontFace, TextStyle
from src.domain.models.questionario import Questionario, StatusEnum
from src.services.pdf.html_editor import html_do_editor
from src.services.pdf.relatorio import (
    AZUL,
    AZUL_CLARO,
    AZUL_ESCURO,
    CINZA,
    LARANJA,
    MARGEM,
    NOTAS,
    TEXTO,
    TEXTO_SUAVE,
    VERDE,
    VERMELHO,
    Relatorio,
    quando,
)

# (etapa, título, [(campo, rótulo)]); a etapa 4 (equipe) é desenhada à parte.
ETAPAS: list[tuple[int, str, list[tuple[str, str]]]] = [
    (2, "Business Model Canvas", [("business_canvas", "")]),
    (3, "Sumário executivo", [("sumario_executivo", "")]),
    (4, "Equipe", []),
    (
        5,
        "Planejamento/Desenvolvimento do Produto e/ou Serviço",
        [("planejamento_produto", "")],
    ),
    (
        6,
        "Planejamento das ações do Mercado",
        [
            ("fornecedores", "Análise dos fornecedores"),
            ("concorrentes", "Análise dos concorrentes"),
            ("analise_acao", "Planejamento das ações"),
        ],
    ),
    (7, "Planejamento das ações de Marketing", [("planejamento_marketing", "")]),
    (
        8,
        "Planejamento da Estrutura, Gerência e Operações",
        [("planejamento_estrutura", "")],
    ),
    (9, "Planejamento Financeiro", [("observacoes", "Observações")]),
]
SITUACOES = {
    StatusEnum.iniciado: ("Não iniciado", CINZA),
    StatusEnum.pendente: ("Em preenchimento", AZUL),
    StatusEnum.aguardando_aprovacao: ("Aguardando aprovação", LARANJA),
    StatusEnum.aprovado: ("Aprovado", VERDE),
    StatusEnum.rejeitado: ("Devolvido", VERMELHO),
}
ROTULO_NOTA = {1: "Ruim", 2: "Razoável", 3: "Bom", 4: "Muito Bom", 5: "Excelente"}

ESTILOS_HTML = {
    "h2": TextStyle(
        font_style="B", font_size_pt=13, color=AZUL_ESCURO, t_margin=3, b_margin=2
    ),
    "h3": TextStyle(
        font_style="B", font_size_pt=12, color=AZUL_ESCURO, t_margin=3, b_margin=2
    ),
    "h4": TextStyle(
        font_style="B", font_size_pt=11, color=AZUL_ESCURO, t_margin=2, b_margin=1.5
    ),
    "blockquote": TextStyle(color=TEXTO_SUAVE, t_margin=2, b_margin=2, l_margin=6),
    "a": FontFace(color=AZUL, emphasis="UNDERLINE"),
}

Nomes = Callable[[str], str]


def _texto(valor: Any) -> str:
    return valor.strip() if isinstance(valor, str) else ""


def _tamanho(bytes_: Any) -> str:
    if not isinstance(bytes_, int | float) or bytes_ <= 0:
        return ""
    for unidade in ("B", "KB", "MB"):
        if bytes_ < 1024 or unidade == "MB":
            return (
                f"{bytes_:.0f} {unidade}"
                if unidade == "B"
                else f"{bytes_:.1f} {unidade}"
            )
        bytes_ /= 1024
    return ""


class _Plano(Relatorio):
    def manter_junto(self, altura: float) -> None:
        """Quebra a página antes se o bloco seguinte começaria colado ao rodapé."""
        if self.get_y() + altura > self.page_break_trigger:
            self.add_page()

    def secao(self, numero: int | None, titulo: str) -> None:
        self.manter_junto(45)  # título + rótulo + primeiras linhas
        self.ln(3)
        y = self.get_y()
        self.set_fill_color(AZUL_CLARO)
        self.rect(MARGEM, y, self.epw, 10, style="F")
        self.set_fill_color(AZUL)
        self.rect(MARGEM, y, 1.6, 10, style="F")
        self.set_xy(MARGEM + 5, y)
        self.set_text_color(AZUL_ESCURO)
        if numero is not None:
            self.set_font("Roboto", "B", 9)
            self.set_text_color(AZUL)
            self.cell(16, 10, f"ETAPA {numero}")
        self.set_font("Roboto", "B", 11.5)
        self.set_text_color(AZUL_ESCURO)
        self.cell(0, 10, titulo)
        self.set_xy(MARGEM, y + 14)

    def rotulo(self, texto: str) -> None:
        self.manter_junto(16)
        self.set_font("Roboto", "B", 8)
        self.set_text_color(TEXTO_SUAVE)
        self.cell(0, 5, texto.upper(), new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def vazio(self, texto: str = "Não preenchido.") -> None:
        self.set_font("Roboto", "I", 10)
        self.set_text_color(TEXTO_SUAVE)
        self.cell(0, 6, texto, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def html(self, valor: Any) -> None:
        html = html_do_editor(valor if isinstance(valor, str) else "")
        if not html:
            self.vazio()
            return
        self.set_font("Roboto", "", 10)
        self.set_text_color(TEXTO)
        self.write_html(
            html,
            font_family="Roboto",
            tag_styles=ESTILOS_HTML,
            li_prefix_color=AZUL,
            ul_bullet_char="•",
            warn_on_tags_not_matching=False,
        )
        self.ln(3)

    def anexos(self, arquivos: Any) -> None:
        arquivos = [a for a in arquivos or [] if isinstance(a, dict) and a.get("nome")]
        if not arquivos:
            return
        self.rotulo("Anexos")
        self.set_font("Roboto", "", 9.5)
        for arquivo in arquivos:
            # Quebra a página antes do marcador, não no meio do item.
            self.manter_junto(6)
            tamanho = _tamanho(arquivo.get("tamanho"))
            self.set_font("Roboto", "B", 11)
            self.set_text_color(AZUL)
            self.cell(5, 5.5, "•")
            self.set_font("Roboto", "", 9.5)
            self.set_text_color(TEXTO)
            self.multi_cell(
                0,
                5.5,
                f"{arquivo['nome']}" + (f"  ({tamanho})" if tamanho else ""),
                align="L",
                new_x="LMARGIN",
                new_y="NEXT",
            )
        self.ln(2)

    def avaliacao(self, avaliacao: Any, nomes: Nomes) -> None:
        if not isinstance(avaliacao, dict):
            return
        nota = avaliacao.get("nota")
        nota = nota.get("valor") if isinstance(nota, dict) else nota
        comentario = _texto(avaliacao.get("comentario"))
        avaliador = _texto(avaliacao.get("avaliador"))
        if nota is None and not comentario:
            return
        self.manter_junto(22)
        cor = NOTAS.get(nota, CINZA)
        x, y = MARGEM, self.get_y()
        self.set_x(x + 5)
        self.set_font("Roboto", "B", 9.5)
        self.set_text_color(cor)
        cabecalho = (
            f"Avaliação: {nota} · {ROTULO_NOTA[nota]}"
            if nota in ROTULO_NOTA
            else "Comentário"
        )
        # `write` quebra a linha na margem: um nome longo continua na linha de baixo,
        # recuado como o resto do bloco.
        self.set_left_margin(x + 5)
        self.write(6, cabecalho)
        if avaliador:
            self.set_font("Roboto", "", 9)
            self.set_text_color(TEXTO_SUAVE)
            self.write(6, f"  por {nomes(avaliador)}")
        self.set_left_margin(MARGEM)
        self.ln(6)
        if comentario:
            self.set_x(x + 5)
            self.set_font("Roboto", "I", 9.5)
            self.set_text_color(TEXTO)
            self.multi_cell(
                self.epw - 8, 5, comentario, align="L", new_x="LMARGIN", new_y="NEXT"
            )
        fim = self.get_y() + 2
        # Barra lateral na cor da nota, como no frontend (só se o bloco ficou na página).
        if fim > y:
            self.set_fill_color(cor)
            self.rect(x, y, 1.2, fim - y - 1, style="F")
        self.set_y(fim + 1)

    def equipe(self, membros: Any) -> None:
        membros = [m for m in membros or [] if isinstance(m, dict)]
        if not membros:
            self.vazio("Nenhum integrante informado.")
            return
        self.tabela(
            ("Nome", "Formação acadêmica", "Experiência", "E-mail", "Telefone"),
            (34, 40, 50, 38, 24),  # mm: soma = largura útil do A4 retrato
            [
                [
                    _texto(m.get(campo)) or "-"
                    for campo in (
                        "nome",
                        "formacao_academica",
                        "experiencia",
                        "email",
                        "telefone",
                    )
                ]
                for m in membros
            ],
            "Nenhum integrante informado.",
        )
        self.ln(4)


def gerar_pdf_plano(
    questionario: Questionario,
    nomes: Mapping[str, str],
    gerado_por: str,
    gerado_em: datetime,
) -> bytes:
    """`nomes`: e-mail -> nome de exibição (dono, avaliadores e quem decidiu)."""

    def nome(email: str) -> str:
        return nomes.get(email, email)

    dados = questionario.json_questionario or {}
    etapa1 = dados.get("1") or {}
    negocio = _texto(etapa1.get("nome_negocio")) or "Negócio sem nome"
    situacao, cor_situacao = SITUACOES.get(
        questionario.status_questionario, (str(questionario.status_questionario), CINZA)
    )

    pdf = _Plano(
        "Plano de negócio",
        f"Questionário nº {questionario.id} · {situacao}",
        gerado_por,
        gerado_em,
        orientacao="portrait",
    )
    pdf.set_font("Roboto", "B", 20)
    pdf.set_text_color(AZUL_ESCURO)
    pdf.multi_cell(0, 9, negocio, align="L", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Roboto", "", 9.5)
    pdf.set_text_color(TEXTO_SUAVE)
    pdf.multi_cell(
        0,
        5,
        f"Responsável: {nome(questionario.usuario_email)} · "
        f"criado em {quando(questionario.criado_em, '%d/%m/%Y')}",
        align="L",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.ln(4)
    pdf.cartoes(
        [
            ("Proponente", _texto(etapa1.get("nome_proponente")) or "-", AZUL),
            (
                "Setor de atuação",
                _texto(etapa1.get("setor_atuacao")) or "-",
                AZUL_ESCURO,
            ),
            ("CNPJ", _texto(etapa1.get("cnpj")) or "Não informado", CINZA),
            ("Situação", situacao, cor_situacao),
        ]
    )

    for numero, titulo, campos in ETAPAS:
        etapa = dados.get(str(numero)) or {}
        pdf.secao(numero, titulo)
        if numero == 4:
            pdf.equipe(etapa.get("equipe"))
        for campo, rotulo in campos:
            if rotulo:
                pdf.rotulo(rotulo)
            pdf.html(etapa.get(campo))
        pdf.anexos(etapa.get("arquivos"))
        pdf.avaliacao(etapa.get("avaliacao"), nome)

    if questionario.decidido_em or questionario.motivo_decisao:
        pdf.secao(None, "Decisão da coordenação")
        pdf.set_font("Roboto", "B", 10)
        pdf.set_text_color(cor_situacao)
        quem = (
            f" por {nome(questionario.decidido_por)}"
            if questionario.decidido_por
            else ""
        )
        em = (
            f" em {quando(questionario.decidido_em, '%d/%m/%Y %H:%M')}"
            if questionario.decidido_em
            else ""
        )
        pdf.multi_cell(
            0, 6, f"{situacao}{em}{quem}", align="L", new_x="LMARGIN", new_y="NEXT"
        )
        if motivo := _texto(questionario.motivo_decisao):
            pdf.ln(1)
            pdf.rotulo("Justificativa")
            pdf.set_font("Roboto", "", 10)
            pdf.set_text_color(TEXTO)
            pdf.multi_cell(0, 5.5, motivo, align="L", new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())


def emails_citados(questionario: Questionario) -> list[str]:
    """Dono, avaliadores das etapas e quem decidiu: os nomes que o PDF exibe."""
    emails = [questionario.usuario_email]
    for etapa in (questionario.json_questionario or {}).values():
        avaliacao = etapa.get("avaliacao") if isinstance(etapa, dict) else None
        if isinstance(avaliacao, dict) and (
            avaliador := _texto(avaliacao.get("avaliador"))
        ):
            emails.append(avaliador)
    if questionario.decidido_por:
        emails.append(questionario.decidido_por)
    return list(dict.fromkeys(emails))
