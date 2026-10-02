import pytest

from shared.exceptions import ValidacaoNegocioError
from shared.validacao_arquivos import rejeitar_anexos_embutidos


def _json(*anexos, aba="6"):
    return {aba: {"fornecedores": "x", "arquivos": list(anexos)}}


class TestRejeitarAnexosEmbutidos:
    def test_referencia_por_caminho_passa(self):
        rejeitar_anexos_embutidos(
            _json(
                {
                    "nome": "b.pdf",
                    "tipo": "application/pdf",
                    "tamanho": 10,
                    "caminho": "ana/6/b.pdf",
                }
            )
        )

    @pytest.mark.parametrize(
        "json",
        [
            None,
            {},
            {"2": {"business_canvas": "x"}},
            {"6": "texto"},
            {"6": {"arquivos": []}},
        ],
    )
    def test_sem_anexos_passa(self, json):
        rejeitar_anexos_embutidos(json)

    def test_base64_e_recusado_com_orientacao(self):
        with pytest.raises(ValidacaoNegocioError) as erro:
            rejeitar_anexos_embutidos(
                _json({"nome": "b.pdf", "conteudo_base64": "JVBERi0="})
            )

        assert "etapa(s) 6" in erro.value.mensagem
        assert "POST /arquivos/questionario/{aba}" in erro.value.mensagem

    def test_lista_todas_as_etapas_com_base64(self):
        json = {
            "6": {"arquivos": [{"nome": "a.pdf", "conteudo_base64": "x"}]},
            "9": {"arquivos": [{"nome": "b.pdf", "conteudo_base64": "y"}]},
        }

        with pytest.raises(ValidacaoNegocioError, match="6, 9"):
            rejeitar_anexos_embutidos(json)
