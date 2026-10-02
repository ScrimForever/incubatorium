from domain.models.questionarios.etapas import (
    ETAPAS,
    etapa_avaliavel,
    etapa_existe,
    etapa_respondida,
    listar_etapas,
    obter_etapa,
)


def test_ha_nove_etapas_com_ids_unicos_e_estaveis():
    ids = [e.id for e in ETAPAS]
    assert ids == list(range(1, 10))
    assert len(set(ids)) == len(ids)


def test_chave_json_e_o_id_como_texto():
    assert obter_etapa(4).chave_json == "4"


def test_etapa_existe_e_inexistente():
    assert etapa_existe(1)
    assert not etapa_existe(0)
    assert not etapa_existe(10)


def test_listar_etapas_ativas():
    assert [e.id for e in listar_etapas()] == list(range(1, 10))


def test_etapa_respondida_ignora_a_nota():
    json = {"2": {"business_canvas": "", "nota": {"valor": 4, "texto": "ok"}}}
    assert not etapa_respondida(json, 2)
    json["2"]["business_canvas"] = "Canvas preenchido"
    assert etapa_respondida(json, 2)


def test_etapa_respondida_trata_json_vazio_e_etapa_invalida():
    assert not etapa_respondida(None, 1)
    assert not etapa_respondida({}, 1)
    assert not etapa_respondida({"1": {"nome_proponente": "x"}}, 99)
    assert not etapa_respondida({"3": "texto solto"}, 3)


def test_so_a_etapa_1_nao_e_avaliavel():
    assert [e.id for e in ETAPAS if not e.avaliavel] == [1]
    assert not etapa_avaliavel(1)
    assert all(etapa_avaliavel(i) for i in range(2, 10))
    assert not etapa_avaliavel(99)
