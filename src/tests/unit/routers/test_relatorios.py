"""Relatórios em PDF dos acessos com falha e com sucesso."""

import io
import re
from datetime import UTC, datetime

import pytest
from pypdf import PdfReader

from src.domain.models.auditoria import EventoAcesso, MotivoAcesso, RegistroAcesso
from src.routers.relatorios import router
from src.services.auditoria import auditoria_service
from src.services.auditoria.relatorio_pdf import (
    gerar_pdf_acessos_falha,
    gerar_pdf_acessos_sucesso,
)

# rota, evento que ela relata, gerador usado pelo service
RELATORIOS = [
    ("acessos-falha", EventoAcesso.login_falha, "gerar_pdf_acessos_falha"),
    ("acessos-sucesso", EventoAcesso.login_sucesso, "gerar_pdf_acessos_sucesso"),
]


def _texto_do_pdf(pdf: bytes) -> str:
    return "\n".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf)).pages)


def _registro(evento, email, motivo=None, **extra):
    return RegistroAcesso(evento=evento, email=email, motivo=motivo, **extra)


@pytest.mark.asyncio
@pytest.mark.parametrize("rota", [r[0] for r in RELATORIOS])
@pytest.mark.parametrize("perfil", ["colaborador", "consultor", "incubado"])
async def test_nao_admin_recebe_403(rota, perfil, criar_usuario, cliente_api):
    cliente = await cliente_api([router], await criar_usuario(perfil))

    assert (await cliente.get(f"/relatorios/{rota}")).status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize(("rota", "evento", "gerador"), RELATORIOS)
async def test_admin_baixa_pdf_com_todos_os_registros_do_evento_e_so_eles(
    rota, evento, gerador, criar_usuario, cliente_api, async_db, monkeypatch
):
    admin = await criar_usuario("admin", "admin@example.com")
    async_db.add_all(
        [
            _registro(
                EventoAcesso.login_falha,
                f"f{i}@example.com",
                MotivoAcesso.credenciais_invalidas,
            )
            for i in range(150)  # acima do limite padrão da listagem (100)
        ]
        + [
            _registro(EventoAcesso.login_sucesso, f"s{i}@example.com")
            for i in range(120)
        ]
        + [
            _registro(
                EventoAcesso.senha_alterada, "x@example.com", MotivoAcesso.propria
            )
        ]
    )
    await async_db.commit()
    recebidos = []
    original = getattr(auditoria_service, gerador)

    def _espiar(registros, gerado_por, gerado_em):
        recebidos.append((registros, gerado_por))
        return original(registros, gerado_por, gerado_em)

    monkeypatch.setattr(auditoria_service, gerador, _espiar)
    cliente = await cliente_api([router], admin)

    resposta = await cliente.get(f"/relatorios/{rota}")

    assert resposta.status_code == 200
    assert resposta.headers["content-type"] == "application/pdf"
    assert re.fullmatch(
        rf'attachment; filename="{rota}-\d{{4}}-\d{{2}}-\d{{2}}\.pdf"',
        resposta.headers["content-disposition"],
    )
    assert resposta.content.startswith(b"%PDF")
    [(registros, gerado_por)] = recebidos
    assert gerado_por == "admin@example.com"
    assert len(registros) == (150 if evento == EventoAcesso.login_falha else 120)
    assert {r.evento for r in registros} == {evento}


def test_pdf_de_falhas_traz_os_dados_de_cada_falha():
    registros = [
        RegistroAcesso(
            evento=EventoAcesso.login_falha,
            motivo=MotivoAcesso.conta_inativa,
            email="ana@example.com",
            ip="203.0.113.7",
            user_agent="Mozilla/5.0 中",  # glifo fora da fonte não quebra o PDF
            criado_em=datetime(2026, 11, 11, 13, 5, 9, tzinfo=UTC),
        ),
        RegistroAcesso(
            evento=EventoAcesso.login_falha,
            motivo=MotivoAcesso.credenciais_invalidas,
            email="ninguem@example.com",
            criado_em=datetime(2026, 11, 10, 9, 0, 0, tzinfo=UTC),
        ),
    ]

    texto = _texto_do_pdf(
        gerar_pdf_acessos_falha(
            registros, "admin@example.com", datetime(2026, 11, 11, tzinfo=UTC)
        )
    )

    for esperado in (
        "Relatório de acessos com falha",
        "admin@example.com",
        "TENTATIVAS COM FALHA",
        "10/11/2026 a 11/11/2026",  # período
        "11/11/2026 10:05:09",  # UTC-3
        "ana@example.com",
        "Conta inativa",
        "203.0.113.7",
        "Mozilla/5.0",
        "ninguem@example.com",
        "Credenciais inválidas",
    ):
        assert esperado in texto, esperado


def test_pdf_de_sucessos_traz_os_dados_e_o_resumo():
    registros = [
        RegistroAcesso(
            evento=EventoAcesso.login_sucesso,
            email=email,
            ip=ip,
            user_agent="curl/8.10.1",
            criado_em=datetime(2026, 11, dia, 13, 5, 9, tzinfo=UTC),
        )
        for email, ip, dia in (
            ("ana@example.com", "203.0.113.7", 11),
            ("ana@example.com", "203.0.113.8", 10),
            ("bia@example.com", "203.0.113.7", 9),
        )
    ]

    texto = _texto_do_pdf(
        gerar_pdf_acessos_sucesso(
            registros, "admin@example.com", datetime(2026, 11, 11, tzinfo=UTC)
        )
    )

    for esperado in (
        "Relatório de acessos com sucesso",
        "ACESSOS COM SUCESSO\n3",
        "USUÁRIOS DISTINTOS\n2",
        "IPS DISTINTOS\n2",
        "09/11/2026 a 11/11/2026",
        "11/11/2026 10:05:09",
        "bia@example.com",
        "203.0.113.8",
        "curl/8.10.1",
    ):
        assert esperado in texto, esperado
    assert "Motivo" not in texto


@pytest.mark.parametrize(
    ("gerar", "aviso"),
    [
        (gerar_pdf_acessos_falha, "Nenhum acesso com falha registrado."),
        (gerar_pdf_acessos_sucesso, "Nenhum acesso com sucesso registrado."),
    ],
)
def test_pdf_vazio_avisa(gerar, aviso):
    pdf = gerar([], "admin@example.com", datetime.now(UTC))

    assert aviso in _texto_do_pdf(pdf)
