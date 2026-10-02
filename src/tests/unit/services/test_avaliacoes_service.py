from unittest.mock import AsyncMock, MagicMock

import pytest

from domain.models.enums import SituacaoIncubacao
from domain.models.questionarios.questionario import Questionario, StatusEnum
from domain.schemas.avaliacao_schema import AvaliacaoInput
from services.avaliacoes.avaliacoes_service import AvaliacoesService
from shared.exceptions import (
    ConflitoError,
    EtapaInvalidaError,
    EtapaNaoAvaliavelError,
    EtapaSemRespostaError,
    NaoEncontradoError,
    SemPermissaoError,
    ValidacaoNegocioError,
)

RESPONDIDO = {"2": {"business_canvas": "Canvas"}, "3": {"sumario_executivo": ""}}


@pytest.fixture
def email_mock():
    servico = MagicMock()
    servico.enviar_email_nova_avaliacao = AsyncMock(return_value=True)
    return servico


@pytest.fixture
def service(async_db, email_mock):
    return AvaliacoesService(async_db, email_service=email_mock)


async def _cenario(async_db, criar_usuario, status=StatusEnum.aguardando_aprovacao):
    incubado = await criar_usuario("incubado", "ana@example.com")
    consultor = await criar_usuario("consultor")
    async_db.add(
        Questionario(
            usuario_email=incubado.email,
            status_questionario=status,
            json_questionario=RESPONDIDO,
            criado_por=incubado.email,
        )
    )
    await async_db.commit()
    return incubado, consultor


def _dados(nota=4, parecer="Bom trabalho"):
    return AvaliacaoInput(nota=nota, parecer=parecer)


class TestAvaliar:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "status", [StatusEnum.aguardando_aprovacao, StatusEnum.aprovado]
    )
    async def test_grava_a_nota_na_etapa_e_notifica(
        self, async_db, criar_usuario, service, email_mock, status
    ):
        incubado, consultor = await _cenario(async_db, criar_usuario, status)

        saida = await service.avaliar(consultor, incubado.email, 2, _dados())

        assert saida["etapa_id"] == 2
        assert saida["nota"] == 4
        assert saida["parecer"] == "Bom trabalho"
        assert saida["avaliador"] == consultor.email
        assert saida["avaliado_em"] is not None
        questionario = await async_db.get(Questionario, incubado.email)
        assert questionario.json_questionario["2"]["nota"]["valor"] == 4
        assert questionario.json_questionario["2"]["business_canvas"] == "Canvas"
        email_mock.enviar_email_nova_avaliacao.assert_awaited_once()

    @pytest.mark.asyncio
    @pytest.mark.parametrize("nota", [1, 5])
    async def test_aceita_os_extremos_da_escala(
        self, async_db, criar_usuario, service, nota
    ):
        incubado, consultor = await _cenario(async_db, criar_usuario)

        saida = await service.avaliar(consultor, incubado.email, 2, _dados(nota))

        assert saida["nota"] == nota

    @pytest.mark.parametrize("nota", [-1, 0, 6])
    def test_nota_fora_de_0_a_5_e_recusada_no_schema(self, nota):
        with pytest.raises(ValueError):
            AvaliacaoInput(nota=nota, parecer="x")

    def test_parecer_em_branco_e_recusado_no_schema(self):
        with pytest.raises(ValueError):
            AvaliacaoInput(nota=3, parecer="   ")

    @pytest.mark.asyncio
    async def test_service_tambem_valida_nota_e_parecer(
        self, async_db, criar_usuario, service
    ):
        incubado, consultor = await _cenario(async_db, criar_usuario)
        sem_validacao = AvaliacaoInput.model_construct(nota=0, parecer="x")
        parecer_vazio = AvaliacaoInput.model_construct(nota=3, parecer="  ")

        with pytest.raises(ValidacaoNegocioError):
            await service.avaliar(consultor, incubado.email, 2, sem_validacao)
        with pytest.raises(ValidacaoNegocioError):
            await service.avaliar(consultor, incubado.email, 2, parecer_vazio)

    @pytest.mark.asyncio
    async def test_etapa_inexistente(self, async_db, criar_usuario, service):
        incubado, consultor = await _cenario(async_db, criar_usuario)

        with pytest.raises(EtapaInvalidaError):
            await service.avaliar(consultor, incubado.email, 99, _dados())

    @pytest.mark.asyncio
    async def test_etapa_1_nao_tem_nota(self, async_db, criar_usuario, service):
        incubado, consultor = await _cenario(async_db, criar_usuario)
        q = await async_db.get(Questionario, incubado.email)
        q.json_questionario = {"1": {"cnpj": "1"}, **RESPONDIDO}
        await async_db.commit()

        with pytest.raises(EtapaNaoAvaliavelError):
            await service.avaliar(consultor, incubado.email, 1, _dados())

        await async_db.refresh(q)
        assert q.json_questionario["1"] == {"cnpj": "1"}

    @pytest.mark.asyncio
    @pytest.mark.parametrize("etapa", [3, 4])
    async def test_etapa_sem_resposta(self, async_db, criar_usuario, service, etapa):
        incubado, consultor = await _cenario(async_db, criar_usuario)

        with pytest.raises(EtapaSemRespostaError):
            await service.avaliar(consultor, incubado.email, etapa, _dados())

    @pytest.mark.asyncio
    async def test_qualquer_consultor_avalia_sem_designacao(
        self, async_db, criar_usuario, service
    ):
        incubado, _ = await _cenario(async_db, criar_usuario)
        outro = await criar_usuario("consultor")

        saida = await service.avaliar(outro, incubado.email, 2, _dados())

        assert saida["avaliador"] == outro.email

    @pytest.mark.asyncio
    @pytest.mark.parametrize("perfil", ["incubado", "colaborador"])
    async def test_outros_perfis_nao_avaliam(
        self, async_db, criar_usuario, service, perfil
    ):
        incubado, _ = await _cenario(async_db, criar_usuario)
        intruso = await criar_usuario(perfil)

        with pytest.raises(SemPermissaoError):
            await service.avaliar(intruso, incubado.email, 2, _dados())

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "status", [StatusEnum.iniciado, StatusEnum.pendente, StatusEnum.rejeitado]
    )
    async def test_so_avalia_pedido_em_analise_ou_aprovado(
        self, async_db, criar_usuario, service, status
    ):
        incubado, consultor = await _cenario(async_db, criar_usuario, status)

        with pytest.raises(ConflitoError):
            await service.avaliar(consultor, incubado.email, 2, _dados())

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "situacao", [SituacaoIncubacao.concluido, SituacaoIncubacao.desistente]
    )
    async def test_incubado_encerrado_nao_recebe_avaliacao(
        self, async_db, criar_usuario, service, situacao
    ):
        incubado, consultor = await _cenario(
            async_db, criar_usuario, StatusEnum.aprovado
        )
        incubado.situacao_incubacao = situacao
        await async_db.commit()

        with pytest.raises(ConflitoError):
            await service.avaliar(consultor, incubado.email, 2, _dados())

    @pytest.mark.asyncio
    async def test_falha_no_email_nao_desfaz_a_nota(
        self, async_db, criar_usuario, service, email_mock
    ):
        incubado, consultor = await _cenario(async_db, criar_usuario)
        email_mock.enviar_email_nova_avaliacao.side_effect = RuntimeError("smtp")

        saida = await service.avaliar(consultor, incubado.email, 2, _dados())

        assert saida["nota"] == 4
        questionario = await async_db.get(Questionario, incubado.email)
        assert questionario.json_questionario["2"]["nota"]["valor"] == 4

    @pytest.mark.asyncio
    async def test_avaliar_de_novo_substitui_a_nota(
        self, async_db, criar_usuario, service
    ):
        incubado, consultor = await _cenario(async_db, criar_usuario)
        await service.avaliar(consultor, incubado.email, 2, _dados(2, "Fraco"))

        saida = await service.avaliar(consultor, incubado.email, 2, _dados(5, "Ótimo"))

        assert (saida["nota"], saida["parecer"]) == (5, "Ótimo")
        assert len(await service.listar(consultor, incubado.email)) == 1


class TestListar:
    @pytest.mark.asyncio
    async def test_dono_equipe_e_consultor_leem(self, async_db, criar_usuario, service):
        incubado, consultor = await _cenario(async_db, criar_usuario)
        colaborador = await criar_usuario("colaborador")
        await service.avaliar(consultor, incubado.email, 2, _dados())

        do_dono = await service.listar(incubado, incubado.email)
        da_equipe = await service.listar(colaborador, incubado.email)
        do_consultor = await service.listar(consultor, incubado.email)

        assert do_dono == da_equipe == do_consultor
        [item] = do_dono
        assert item["titulo"] == "Desenvolva o Business Model Canvas para seu negócio"
        assert item["avaliador"] == consultor.email

    @pytest.mark.asyncio
    async def test_outro_incubado_nao_le(self, async_db, criar_usuario, service):
        incubado, _ = await _cenario(async_db, criar_usuario)
        intruso = await criar_usuario("incubado")
        with pytest.raises(SemPermissaoError):
            await service.listar(intruso, incubado.email)

    @pytest.mark.asyncio
    async def test_sem_questionario_devolve_lista_vazia(self, criar_usuario, service):
        colaborador = await criar_usuario("colaborador")
        incubado = await criar_usuario("incubado")

        assert await service.listar(colaborador, incubado.email) == []

    @pytest.mark.asyncio
    async def test_incubado_inexistente_para_avaliar(
        self, async_db, criar_usuario, service
    ):
        consultor = await criar_usuario("consultor")
        with pytest.raises(NaoEncontradoError):
            await service.avaliar(consultor, consultor.email, 2, _dados())
