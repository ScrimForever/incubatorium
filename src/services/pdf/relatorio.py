"""Base visual dos relatórios em PDF, com a identidade do frontend.

Cores de `frontend/src/styles.scss` (azul da marca, gradiente azul→verde, escala de
notas) e a fonte Roboto embutida, que também cobre acentos e símbolos fora do latin-1.
"""

from collections.abc import Sequence
from datetime import datetime
from pathlib import Path

from fpdf import FPDF
from fpdf.fonts import FontFace
from fpdf.pattern import LinearGradient
from src.shared.datas import FUSO, como_utc

TEMPLATES = Path(__file__).resolve().parents[2] / "templates"
LOGO = TEMPLATES / "img" / "logo.png"
FONTES = TEMPLATES / "fontes"

AZUL = "#2469b3"
AZUL_ESCURO = "#143c68"
AZUL_CLARO = "#eaf1fa"
VERDE = "#6fb643"
FUNDO_APP = "#f4f6f8"
TEXTO = "#333333"
TEXTO_SUAVE = "#666666"
BORDA = "#d5dde3"
BRANCO = "#ffffff"
CINZA = "#7d8a95"  # --borda-controle
# --nota-N-forte: escala de notas, do vermelho (1) ao verde (5).
NOTAS = {1: "#b3261e", 2: "#a2540b", 3: "#8a6300", 4: "#46790f", 5: "#2f7d1f"}
VERMELHO, LARANJA = NOTAS[1], NOTAS[2]
MARGEM = 12
ALTURA_FAIXA = 24

Celula = str | tuple[str, FontFace]


def quando(momento: datetime, formato: str = "%d/%m/%Y %H:%M:%S") -> str:
    return como_utc(momento).astimezone(FUSO).strftime(formato)


class Relatorio(FPDF):
    """Página A4 com a faixa da marca no topo e o rodapé paginado."""

    def __init__(
        self,
        titulo: str,
        subtitulo: str,
        gerado_por: str,
        gerado_em: datetime,
        orientacao: str = "landscape",
    ):
        super().__init__(orientation=orientacao, format="A4")
        self.titulo, self.subtitulo = titulo, subtitulo
        self.rodape = (
            f"TecCampos · gerado em {quando(gerado_em, '%d/%m/%Y %H:%M')} "
            f"(horário de Brasília) por {gerado_por}"
        )
        self.add_font("Roboto", "", FONTES / "Roboto-Regular.ttf")
        self.add_font("Roboto", "B", FONTES / "Roboto-Bold.ttf")
        self.add_font("Roboto", "I", FONTES / "Roboto-Italic.ttf")
        # Sem Roboto negrito-itálico embutida: o itálico prevalece.
        self.add_font("Roboto", "BI", FONTES / "Roboto-Italic.ttf")
        self.set_margins(MARGEM, ALTURA_FAIXA + 8, MARGEM)
        self.set_auto_page_break(auto=True, margin=19)  # rodapé de até 2 linhas
        self.set_title(titulo)
        self.set_author("TecCampos")
        self.add_page()

    def header(self):
        self.set_fill_color(AZUL)
        self.rect(0, 0, self.w, ALTURA_FAIXA, style="F")
        # O logo tem o mesmo fundo azul da faixa: entra sem moldura.
        self.image(LOGO, x=MARGEM - 2, y=4, h=ALTURA_FAIXA - 8)
        with self.use_pattern(LinearGradient(0, 0, self.w, 0, colors=[AZUL, VERDE])):
            self.rect(0, ALTURA_FAIXA, self.w, 1.6, style="F")
        # O gradiente fica como preenchimento ativo da página, mas o fpdf2 continua
        # achando que é o AZUL de antes; trocar para outra cor sólida grava a cor de
        # novo. Sem isso, texto em AZUL logo no topo da página sai com o gradiente.
        self.set_fill_color(BRANCO)

        self.set_text_color(BRANCO)
        self.set_xy(MARGEM, 6)
        self.set_font("Roboto", "B", 16)
        self.cell(0, 7, self.titulo, align="R")
        self.set_xy(MARGEM, 13.5)
        self.set_font("Roboto", "", 9)
        self.cell(0, 5, self.subtitulo, align="R")
        self.set_xy(MARGEM, self.t_margin)

    def footer(self):
        """Rodapé inteiro, sem cortes: o texto quebra em até duas linhas (encolhendo
        a fonte se preciso) e a paginação fica à direita, centrada na altura."""
        pagina = f"Página {self.page_no()} de {{nb}}"
        largura = self.epw - 30
        tamanho = 8.0
        while True:
            self.set_font("Roboto", "", tamanho)
            linhas = self.multi_cell(
                largura, 3.6, self.rodape, dry_run=True, output="LINES"
            )
            if len(linhas) <= 2 or tamanho <= 6:
                break
            tamanho -= 0.5
        altura = 3.6 * len(linhas)
        y = -6 - altura
        self.set_draw_color(BORDA)
        self.line(MARGEM, self.h + y - 2, self.w - MARGEM, self.h + y - 2)
        self.set_text_color(TEXTO_SUAVE)
        self.set_xy(MARGEM, self.h + y)
        self.multi_cell(largura, 3.6, self.rodape, align="L")
        self.set_font("Roboto", "", 8)
        self.set_xy(MARGEM, self.h + y)
        self.cell(0, altura, pagina, align="R")

    def _linhas_do_cartao(self, valor: str, largura: float) -> tuple[float, list[str]]:
        """Fonte e linhas do valor, sempre inteiro: grande numa linha só quando cabe;
        senão 10 pt, quebrando em quantas linhas forem precisas."""
        tamanho = 18 if len(valor) <= 12 else 13
        while tamanho >= 10:
            self.set_font("Roboto", "B", tamanho)
            if self.get_string_width(valor) <= largura:
                return tamanho, [valor]
            tamanho -= 1
        self.set_font("Roboto", "B", 10)
        return 10, self.multi_cell(largura, 4.6, valor, dry_run=True, output="LINES")

    def cartoes(self, cartoes: Sequence[tuple[str, str, str]]) -> None:
        """Linha de cartões de resumo: (rótulo, valor, cor da barra lateral). Valores
        longos quebram em linhas e todos os cartões crescem juntos."""
        espaco, y = 5, self.get_y()
        largura = (self.epw - espaco * (len(cartoes) - 1)) / len(cartoes)
        valores = [
            self._linhas_do_cartao(valor, largura - 8) for _, valor, _ in cartoes
        ]
        altura = max(20, 8.5 + max(len(linhas) for _, linhas in valores) * 4.6 + 3)
        for i, ((rotulo, _, cor), (tamanho, linhas)) in enumerate(
            zip(cartoes, valores)
        ):
            x = MARGEM + i * (largura + espaco)
            self.set_fill_color(BRANCO)
            self.set_draw_color(BORDA)
            self.rect(
                x, y, largura, altura, style="DF", round_corners=True, corner_radius=2
            )
            self.set_fill_color(cor)
            self.rect(x, y, 1.6, altura, style="F")
            self.set_xy(x + 5, y + 3)
            self.set_font("Roboto", "", 8)
            self.set_text_color(TEXTO_SUAVE)
            self.cell(largura - 8, 4, rotulo.upper())
            self.set_font("Roboto", "B", tamanho)
            self.set_text_color(AZUL_ESCURO)
            if len(linhas) == 1:
                self.set_xy(x + 5, y + 8.5)
                self.cell(largura - 8, 9, linhas[0])
            else:
                for n, linha in enumerate(linhas):
                    self.set_xy(x + 5, y + 9 + n * 4.6)
                    self.cell(largura - 8, 4.6, linha)
        self.set_xy(MARGEM, y + altura + 8)

    def tabela(
        self,
        colunas: Sequence[str],
        larguras: Sequence[float],
        linhas: Sequence[Sequence[Celula]],
        vazio: str,
    ) -> None:
        if not linhas:
            self.set_fill_color(AZUL_CLARO)
            self.set_text_color(AZUL_ESCURO)
            self.set_font("Roboto", "B", 11)
            self.cell(0, 16, vazio, align="C", fill=True)
            return
        self.set_font("Roboto", "", 8)
        self.set_text_color(TEXTO)
        self.set_draw_color(BORDA)
        self.set_line_width(0.2)
        # Linhas pares: cor de preenchimento corrente; ímpares: `cell_fill_color`.
        self.set_fill_color(BRANCO)
        with self.table(
            col_widths=larguras,
            text_align="LEFT",
            v_align="MIDDLE",
            line_height=4.2,
            padding=(2.2, 2),
            borders_layout="HORIZONTAL_LINES",
            headings_style=FontFace(
                family="Roboto", emphasis="BOLD", color=BRANCO, fill_color=AZUL_ESCURO
            ),
            cell_fill_color=FUNDO_APP,
            cell_fill_mode="ROWS",
            repeat_headings=1,
        ) as tabela:
            tabela.row(colunas)
            for celulas in linhas:
                linha = tabela.row()
                for celula in celulas:
                    if isinstance(celula, tuple):
                        linha.cell(celula[0], style=celula[1])
                    else:
                        linha.cell(celula)
