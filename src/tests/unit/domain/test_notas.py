from domain.models.questionarios.notas import (
    mesclar_preservando_notas,
    nota_vazia,
    notas_avaliadas,
    zerar_notas,
)

NOTA = {
    "valor": 4,
    "texto": "Bom canvas",
    "avaliador": "c@x.com",
    "avaliado_em": "2026-10-01",
}


class TestMesclar:
    def test_descarta_a_nota_vinda_do_incubado_e_mantem_a_gravada(self):
        atual = {"2": {"business_canvas": "v1", "nota": NOTA}}
        novo = {
            "2": {"business_canvas": "v2", "nota": {"valor": 5, "texto": "forjada"}}
        }

        resultado = mesclar_preservando_notas(novo, atual)

        assert resultado["2"]["business_canvas"] == "v2"
        assert resultado["2"]["nota"] == NOTA

    def test_aba_sem_avaliacao_recebe_nota_vazia_mesmo_que_o_incubado_envie_uma(self):
        novo = {
            "3": {"sumario_executivo": "x", "nota": {"valor": 5, "texto": "forjada"}}
        }

        resultado = mesclar_preservando_notas(novo, {})

        assert resultado["3"]["nota"] == nota_vazia()

    def test_aba_omitida_mas_avaliada_continua_com_a_nota(self):
        atual = {"2": {"business_canvas": "v1", "nota": NOTA}}

        resultado = mesclar_preservando_notas({"1": {"cnpj": "1"}}, atual)

        assert resultado["2"] == {"nota": NOTA}

    def test_etapa_1_nao_ganha_nota_e_perde_a_enviada_pelo_cliente(self):
        novo = {
            "1": {"cnpj": "1", "nota": {"valor": 5, "texto": "forjada"}},
            "2": {"business_canvas": "x"},
        }

        resultado = mesclar_preservando_notas(novo, {"1": {"nota": NOTA}})

        assert resultado["1"] == {"cnpj": "1"}
        assert resultado["2"]["nota"] == nota_vazia()

    def test_etapa_1_so_com_nota_antiga_nao_e_mantida(self):
        resultado = mesclar_preservando_notas({"2": {"x": 1}}, {"1": {"nota": NOTA}})

        assert "1" not in resultado

    def test_nao_altera_os_dicionarios_de_entrada(self):
        atual = {"2": {"nota": NOTA}}
        novo = {"2": {"business_canvas": "x"}}

        mesclar_preservando_notas(novo, atual)

        assert novo == {"2": {"business_canvas": "x"}}
        assert atual == {"2": {"nota": NOTA}}

    def test_none_continua_none_e_chaves_fora_das_etapas_passam(self):
        assert mesclar_preservando_notas(None, {"2": {"nota": NOTA}}) is None
        assert mesclar_preservando_notas({"extra": 1}, None) == {"extra": 1}


class TestZerar:
    def test_zera_so_as_notas(self):
        json = {
            "2": {"business_canvas": "x", "nota": NOTA},
            "3": {"sumario_executivo": "y"},
        }

        resultado = zerar_notas(json)

        assert resultado["2"] == {"business_canvas": "x", "nota": nota_vazia()}
        assert resultado["3"] == {"sumario_executivo": "y"}
        assert json["2"]["nota"] == NOTA  # entrada intacta

    def test_etapa_1_perde_a_nota_em_vez_de_zerada(self):
        resultado = zerar_notas({"1": {"cnpj": "1", "nota": NOTA}})

        assert resultado["1"] == {"cnpj": "1"}

    def test_none_vira_dicionario_vazio(self):
        assert zerar_notas(None) == {}


class TestAvaliadas:
    def test_lista_so_etapas_com_valor_ou_parecer_em_ordem(self):
        json = {
            "5": {"nota": {"valor": None, "texto": "só parecer"}},
            "2": {"nota": NOTA},
            "3": {"nota": nota_vazia()},
            "4": {},
        }

        assert [etapa for etapa, _ in notas_avaliadas(json)] == [2, 5]
        assert notas_avaliadas(None) == []


def test_avaliadas_ignora_nota_na_etapa_1():
    assert notas_avaliadas({"1": {"nota": NOTA}}) == []
