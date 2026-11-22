"""PDFs dos relatórios de acesso (falhas e sucessos)."""

from collections.abc import Sequence
from datetime import datetime

from fpdf.fonts import FontFace
from src.domain.models.auditoria import MotivoAcesso, RegistroAcesso
from src.services.pdf.relatorio import (
    AZUL,
    AZUL_ESCURO,
    CINZA,
    LARANJA,
    TEXTO,
    VERDE,
    VERMELHO,
    Relatorio,
    quando,
)

MOTIVOS = {
    MotivoAcesso.credenciais_invalidas: ("Credenciais inválidas", VERMELHO),
    MotivoAcesso.conta_inativa: ("Conta inativa", LARANJA),
}


def _periodo(registros: Sequence[RegistroAcesso]) -> str:
    if not registros:
        return "-"
    datas = [r.criado_em for r in registros]
    return f"{quando(min(datas), '%d/%m/%Y')} a {quando(max(datas), '%d/%m/%Y')}"


def gerar_pdf_acessos_falha(
    registros: Sequence[RegistroAcesso], gerado_por: str, gerado_em: datetime
) -> bytes:
    pdf = Relatorio(
        "Relatório de acessos com falha",
        "Auditoria de acesso · tentativas de login recusadas",
        gerado_por,
        gerado_em,
    )
    contagem = {m: sum(r.motivo == m for r in registros) for m in MOTIVOS}
    pdf.cartoes(
        [
            ("Tentativas com falha", str(len(registros)), AZUL),
            *(
                (rotulo, str(contagem[motivo]), cor)
                for motivo, (rotulo, cor) in MOTIVOS.items()
            ),
            ("Período", _periodo(registros), VERDE),
        ]
    )
    linhas = []
    for r in registros:
        rotulo, cor = MOTIVOS.get(r.motivo, (str(r.motivo or "-"), TEXTO))
        linhas.append(
            [
                quando(r.criado_em),
                r.email,
                (rotulo, FontFace(emphasis="BOLD", color=cor)),
                r.ip or "-",
                r.user_agent or "-",
            ]
        )
    pdf.tabela(
        ("Data/hora", "E-mail informado", "Motivo", "IP", "Navegador (user-agent)"),
        (34, 64, 38, 28, 109),  # mm: soma = largura útil do A4 paisagem
        linhas,
        "Nenhum acesso com falha registrado.",
    )
    return bytes(pdf.output())


def gerar_pdf_acessos_sucesso(
    registros: Sequence[RegistroAcesso], gerado_por: str, gerado_em: datetime
) -> bytes:
    pdf = Relatorio(
        "Relatório de acessos com sucesso",
        "Auditoria de acesso · logins realizados",
        gerado_por,
        gerado_em,
    )
    pdf.cartoes(
        [
            ("Acessos com sucesso", str(len(registros)), VERDE),
            ("Usuários distintos", str(len({r.email for r in registros})), AZUL),
            ("IPs distintos", str(len({r.ip for r in registros if r.ip})), AZUL_ESCURO),
            ("Período", _periodo(registros), CINZA),
        ]
    )
    pdf.tabela(
        ("Data/hora", "E-mail", "IP", "Navegador (user-agent)"),
        (34, 72, 30, 137),
        [
            [quando(r.criado_em), r.email, r.ip or "-", r.user_agent or "-"]
            for r in registros
        ],
        "Nenhum acesso com sucesso registrado.",
    )
    return bytes(pdf.output())
