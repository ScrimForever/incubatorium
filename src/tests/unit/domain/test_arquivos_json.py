from domain.models.questionarios.arquivos import (
    adicionar_referencias,
    etapas_com_conteudo_embutido,
    nova_referencia,
    preservar_arquivos,
    reescrever_caminhos,
    remover_referencias,
    tem_conteudo_embutido,
)


def _ref(nome="a.pdf", aba=6):
    return nova_referencia("ana@example.com", aba, nome, "application/pdf", 10)


def test_nova_referencia_usa_caminho_relativo_sem_arroba_e_ponto():
    assert _ref() == {
        "nome": "a.pdf",
        "tipo": "application/pdf",
        "tamanho": 10,
        "caminho": "anaexamplecom/6/a.pdf",
    }


def test_nova_referencia_sem_tipo_usa_octet_stream():
    ref = nova_referencia("ana@example.com", 6, "a.bin", None, 1)
    assert ref["tipo"] == "application/octet-stream"


def test_adicionar_nao_altera_o_original_e_nao_duplica_o_mesmo_caminho():
    original = {"6": {"fornecedores": "x"}}

    um = adicionar_referencias(original, 6, [_ref()])
    dois = adicionar_referencias(um, 6, [{**_ref(), "tamanho": 99}])

    assert original == {"6": {"fornecedores": "x"}}
    assert dois["6"]["fornecedores"] == "x"
    assert [a["tamanho"] for a in dois["6"]["arquivos"]] == [99]


def test_adicionar_cria_etapa_ausente_e_aceita_json_vazio():
    assert adicionar_referencias(None, 6, [_ref()])["6"]["arquivos"] == [_ref()]


def test_remover_so_tira_os_nomes_pedidos():
    json = adicionar_referencias(None, 6, [_ref("a.pdf"), _ref("b.pdf")])

    resultado = remover_referencias(json, 6, ["a.pdf"])

    assert [a["nome"] for a in resultado["6"]["arquivos"]] == ["b.pdf"]
    assert len(json["6"]["arquivos"]) == 2


def test_remover_em_etapa_sem_lista_nao_cria_nada():
    assert remover_referencias({"6": {"x": 1}}, 6, ["a.pdf"]) == {"6": {"x": 1}}


def test_preservar_descarta_arquivos_do_cliente_e_mantem_os_gravados():
    atual = adicionar_referencias(None, 6, [_ref()])
    novo = {"6": {"fornecedores": "y", "arquivos": [{"nome": "falso.pdf"}]}}

    resultado = preservar_arquivos(novo, atual)

    assert resultado["6"]["arquivos"] == [_ref()]
    assert resultado["6"]["fornecedores"] == "y"


def test_preservar_mantem_etapa_que_so_tem_anexos_e_nao_inventa_lista():
    atual = adicionar_referencias(None, 6, [_ref()])

    resultado = preservar_arquivos({"2": {"canvas": "c"}}, atual)

    assert resultado["6"]["arquivos"] == [_ref()]
    assert "arquivos" not in resultado["2"]


def test_preservar_zera_lista_enviada_quando_nada_gravado():
    resultado = preservar_arquivos({"6": {"arquivos": [{"nome": "x"}]}}, {})
    assert resultado["6"]["arquivos"] == []


def test_preservar_none_continua_none():
    assert preservar_arquivos(None, {"6": {}}) is None


def test_reescrever_caminhos_troca_so_o_prefixo_da_pasta():
    json = adicionar_referencias(
        None, 6, [_ref(), {**_ref("b.pdf"), "caminho": "outrapasta/6/b.pdf"}]
    )

    resultado = reescrever_caminhos(json, "anaexamplecom", "anaexamplecom_1")

    caminhos = [a["caminho"] for a in resultado["6"]["arquivos"]]
    assert caminhos == ["anaexamplecom_1/6/a.pdf", "outrapasta/6/b.pdf"]
    assert json["6"]["arquivos"][0]["caminho"] == "anaexamplecom/6/a.pdf"


def test_conteudo_embutido_e_detectado_por_etapa():
    json = {"6": {"arquivos": [{"nome": "a", "conteudo_base64": "JVBERi0="}]}}

    assert etapas_com_conteudo_embutido(json) == [6]
    assert tem_conteudo_embutido(json)
    assert not tem_conteudo_embutido(adicionar_referencias(None, 6, [_ref()]))
    assert not tem_conteudo_embutido(None)
