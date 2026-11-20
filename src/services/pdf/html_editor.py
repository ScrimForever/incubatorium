"""Converte o HTML do editor do frontend (Quill 2) no subconjunto que o fpdf2 desenha.

O Quill grava as duas listas como `<ol>` e diz o tipo em cada item
(`<li data-list="bullet|ordered|checked|unchecked">`); cores, tamanhos, recuos e
alinhamentos vêm em `class`/`style` e são descartados, para o PDF seguir o padrão do
relatório. Texto sem tags (gravado antes do editor) vira um parágrafo por linha.
"""

from html import escape
from html.parser import HTMLParser

# Tag do Quill -> tag desenhada pelo fpdf2 (sem atributos).
_EQUIVALENTES = {
    "p": "p",
    "b": "b",
    "strong": "b",
    "i": "i",
    "em": "i",
    "u": "u",
    "s": "s",
    "strike": "s",
    "del": "s",
    "h1": "h2",
    "h2": "h2",
    "h3": "h3",
    "h4": "h4",
    "h5": "h4",
    "h6": "h4",
    "blockquote": "blockquote",
    "pre": "pre",
}
_MARCA_TAREFA = {"checked": "[x] ", "unchecked": "[ ] "}
_IGNORADAS = {"script", "style"}  # o conteúdo também é descartado


class _Conversor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.saida: list[str] = []
        self.listas: list[str] = []  # tag da lista aberta em cada nível (ou "")
        self.links: list[bool] = []
        self.divs: list[bool] = []  # cada <div> aberta é linha de bloco de código?
        self.ignorando = 0

    def handle_starttag(self, tag, attrs):
        atributos = dict(attrs)
        if tag in _IGNORADAS:
            self.ignorando += 1
        elif tag in ("ol", "ul"):
            self.listas.append("")
        elif tag == "li":
            pai = "ul" if self.listas and self.listas[-1] == "ul" else "ol"
            tipo = atributos.get("data-list")
            lista = (
                "ol" if tipo == "ordered" or (tipo is None and pai == "ol") else "ul"
            )
            if not self.listas:
                self.listas.append("")
            if self.listas[-1] != lista:
                self._fechar_lista()
                self.saida.append(f"<{lista}>")
                self.listas[-1] = lista
            self.saida.append("<li>" + _MARCA_TAREFA.get(tipo, ""))
        elif tag == "br":
            self.saida.append("<br>")
        elif tag == "a" and (href := atributos.get("href", "")).startswith(
            ("http://", "https://", "mailto:")
        ):
            self.saida.append(f'<a href="{escape(href)}">')
            self.links.append(True)
        elif tag == "a":
            self.links.append(False)
        elif tag == "div":
            codigo = "ql-code-block" in (atributos.get("class") or "").split()
            self.divs.append(codigo)
            if codigo:
                self.saida.append("<pre>")
        elif tag in _EQUIVALENTES:
            self.saida.append(f"<{_EQUIVALENTES[tag]}>")

    def handle_endtag(self, tag):
        if tag in _IGNORADAS:
            self.ignorando = max(0, self.ignorando - 1)
        elif tag in ("ol", "ul"):
            self._fechar_lista()
            if self.listas:
                self.listas.pop()
        elif tag == "li":
            self.saida.append("</li>")
        elif tag == "a":
            if self.links and self.links.pop():
                self.saida.append("</a>")
        elif tag == "div":
            if self.divs and self.divs.pop():
                self.saida.append("</pre>")
        elif tag in _EQUIVALENTES:
            self.saida.append(f"</{_EQUIVALENTES[tag]}>")

    def handle_data(self, data):
        if not self.ignorando:
            self.saida.append(escape(data, quote=False))

    def _fechar_lista(self):
        if self.listas and self.listas[-1]:
            self.saida.append(f"</{self.listas[-1]}>")
            self.listas[-1] = ""


def html_do_editor(valor: str | None) -> str:
    """HTML seguro para `FPDF.write_html`; vazio quando não há texto."""
    valor = (valor or "").strip()
    if not valor:
        return ""
    if not valor.startswith("<"):
        return "".join(
            f"<p>{escape(linha, quote=False) or '<br>'}</p>"
            for linha in valor.splitlines()
        )
    conversor = _Conversor()
    conversor.feed(valor)
    conversor.close()
    while conversor.listas:
        conversor._fechar_lista()
        conversor.listas.pop()
    return "".join(conversor.saida)
