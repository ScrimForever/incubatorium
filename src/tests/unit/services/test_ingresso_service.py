from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import select

from domain.models.enums import SituacaoIncubacao
from domain.models.questionarios.questionario import Questionario, StatusEnum
from domain.schemas.questionario_schema import QuestionarioInputSchema
from repository.ingresso.ingresso_rep import IngressoRepository
from services.ingresso.ingresso_service import IngressoService
from shared.exceptions import (
    ConflitoError,
    MotivoObrigatorioError,
    NaoEncontradoError,
    PedidoJaDecididoError,
    SemPermissaoError,
    ValidacaoNegocioError,
)

NOTA_VAZIA = {"valor": None, "texto": "", "avaliador": None, "avaliado_em": None}
PREENCHIDO = {"2": {"business_canvas": "Canvas", "nota": {"valor": 4, "texto": "ok"}}}


@pytest.fixture
def email_mock():
    servico = MagicMock()
    servico.enviar_email_decisao_ingresso = AsyncMock(return_value=True)
    return servico


@pytest.fixture
def service(async_db, email_mock):
    return IngressoService(async_db, email_service=email_mock)


async def _semear(async_db, email, status, json=None):
    async_db.add(
        Questionario(
            usuario_email=email,
            status_questionario=status,
            json_questionario=PREENCHIDO if json is None else json,
            criado_por=email,
        )
    )
    await async_db.commit()


class TestEnviar:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("status", [StatusEnum.iniciado, StatusEnum.pendente])
    async def test_envia_para_analise(self, async_db, criar_usuario, service, status):
        usuario = await criar_usuario("incubado")
        await _semear(async_db, usuario.email, status)

        questionario = await service.enviar(usuario)

        assert questionario.status_questionario == StatusEnum.aguardando_aprovacao

    @pytest.mark.asyncio
    async def test_questionario_vazio_nao_pode_ser_enviado(
        self, async_db, criar_usuario, service
    ):
        usuario = await criar_usuario("incubado")
        await _semear(async_db, usuario.email, StatusEnum.pendente, json={})

        with pytest.raises(ValidacaoNegocioError):
            await service.enviar(usuario)

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "status",
        [StatusEnum.aguardando_aprovacao, StatusEnum.aprovado, StatusEnum.rejeitado],
    )
    async def test_estados_que_nao_enviam(
        self, async_db, criar_usuario, service, status
    ):
        usuario = await criar_usuario("incubado")
        await _semear(async_db, usuario.email, status)

        with pytest.raises(ConflitoError):
            await service.enviar(usuario)

    @pytest.mark.asyncio
    async def test_sem_questionario(self, criar_usuario, service):
        usuario = await criar_usuario("incubado")
        with pytest.raises(NaoEncontradoError):
            await service.enviar(usuario)


class TestDecisao:
    @pytest.mark.asyncio
    async def test_aprovar_grava_status_ativa_usuario_e_notifica(
        self, async_db, criar_usuario, service, email_mock
    ):
        candidato = await criar_usuario("incubado", "ana@example.com")
        colaborador = await criar_usuario("colaborador")
        await _semear(async_db, candidato.email, StatusEnum.aguardando_aprovacao)

        questionario = await service.aprovar(colaborador, candidato.email)

        assert questionario.status_questionario == StatusEnum.aprovado
        assert candidato.situacao_incubacao == SituacaoIncubacao.ativo
        email_mock.enviar_email_decisao_ingresso.assert_awaited_once_with(
            "ana@example.com", True, None
        )

    @pytest.mark.asyncio
    async def test_aprovar_duas_vezes(self, async_db, criar_usuario, service):
        candidato = await criar_usuario("incubado")
        colaborador = await criar_usuario("colaborador")
        await _semear(async_db, candidato.email, StatusEnum.aguardando_aprovacao)
        await service.aprovar(colaborador, candidato.email)

        with pytest.raises(PedidoJaDecididoError):
            await service.aprovar(colaborador, candidato.email)

    @pytest.mark.asyncio
    async def test_nao_decide_pedido_que_nao_esta_em_analise(
        self, async_db, criar_usuario, service
    ):
        candidato = await criar_usuario("incubado")
        colaborador = await criar_usuario("colaborador")
        await _semear(async_db, candidato.email, StatusEnum.pendente)

        with pytest.raises(PedidoJaDecididoError):
            await service.rejeitar(colaborador, candidato.email, "motivo")

    @pytest.mark.asyncio
    @pytest.mark.parametrize("motivo", ["", "   ", None])
    async def test_rejeitar_sem_motivo(
        self, async_db, criar_usuario, service, email_mock, motivo
    ):
        candidato = await criar_usuario("incubado")
        colaborador = await criar_usuario("colaborador")
        await _semear(async_db, candidato.email, StatusEnum.aguardando_aprovacao)

        with pytest.raises(MotivoObrigatorioError):
            await service.rejeitar(colaborador, candidato.email, motivo)

        email_mock.enviar_email_decisao_ingresso.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_rejeitar_grava_motivo_e_notifica(
        self, async_db, criar_usuario, service, email_mock
    ):
        candidato = await criar_usuario("incubado", "ana@example.com")
        colaborador = await criar_usuario("colaborador")
        await _semear(async_db, candidato.email, StatusEnum.aguardando_aprovacao)

        questionario = await service.rejeitar(
            colaborador, candidato.email, "  Faltou o canvas  "
        )

        assert questionario.status_questionario == StatusEnum.rejeitado
        assert questionario.motivo_decisao == "Faltou o canvas"
        email_mock.enviar_email_decisao_ingresso.assert_awaited_once_with(
            "ana@example.com", False, "Faltou o canvas"
        )

    @pytest.mark.asyncio
    async def test_falha_no_email_nao_desfaz_a_decisao(
        self, async_db, criar_usuario, service, email_mock
    ):
        candidato = await criar_usuario("incubado")
        colaborador = await criar_usuario("colaborador")
        await _semear(async_db, candidato.email, StatusEnum.aguardando_aprovacao)
        email_mock.enviar_email_decisao_ingresso.side_effect = RuntimeError("smtp")

        questionario = await service.aprovar(colaborador, candidato.email)

        assert questionario.status_questionario == StatusEnum.aprovado


class TestReiniciar:
    @pytest.mark.asyncio
    async def test_reinicia_arquiva_e_copia_anexos(
        self, async_db, criar_usuario, service, monkeypatch
    ):
        usuario = await criar_usuario("incubado", "ana@example.com")
        await _semear(async_db, usuario.email, StatusEnum.rejeitado)
        copiar = MagicMock()
        monkeypatch.setattr("services.ingresso.ingresso_service.arquivar_pasta", copiar)

        novo = await service.reiniciar(usuario)

        assert novo.status_questionario == StatusEnum.pendente
        assert novo.json_questionario == {
            "2": {"business_canvas": "Canvas", "nota": NOTA_VAZIA}
        }
        copiar.assert_called_once_with("ana@example.com", 1)
        chaves = (await async_db.execute(select(Questionario.usuario_email))).scalars()
        assert sorted(chaves) == ["ana@example.com", "ana@example.com_1"]

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "status",
        [
            StatusEnum.iniciado,
            StatusEnum.pendente,
            StatusEnum.aguardando_aprovacao,
            StatusEnum.aprovado,
        ],
    )
    async def test_so_reinicia_se_rejeitado(
        self, async_db, criar_usuario, service, status
    ):
        usuario = await criar_usuario("incubado")
        await _semear(async_db, usuario.email, status)

        with pytest.raises(ConflitoError):
            await service.reiniciar(usuario)


class TestHistorico:
    @pytest.mark.asyncio
    async def test_dono_e_colaborador_veem_outro_incubado_nao(
        self, async_db, criar_usuario, service
    ):
        dono = await criar_usuario("incubado", "ana@example.com")
        outro = await criar_usuario("incubado")
        colaborador = await criar_usuario("colaborador")
        await _semear(async_db, "ana@example.com_1", StatusEnum.rejeitado)

        do_dono = await service.historico(dono, dono.email)
        da_equipe = await service.historico(colaborador, dono.email)

        assert [h["chave"] for h in do_dono] == ["ana@example.com_1"]
        assert do_dono[0]["ordem"] == 1
        assert da_equipe == do_dono
        with pytest.raises(SemPermissaoError):
            await service.historico(outro, dono.email)


class TestAtualizarPlano:
    @staticmethod
    def _entrada(status, json=PREENCHIDO):
        return QuestionarioInputSchema(
            status_questionario=status, json_questionario=json
        )

    @pytest.mark.asyncio
    async def test_salva_respostas_em_preenchimento(
        self, async_db, criar_usuario, service
    ):
        usuario = await criar_usuario("incubado")
        await _semear(async_db, usuario.email, StatusEnum.iniciado, json={})

        q = await service.atualizar_plano(usuario, self._entrada(StatusEnum.pendente))

        assert q.status_questionario == StatusEnum.pendente
        assert q.json_questionario["2"]["business_canvas"] == "Canvas"
        assert q.atualizado_por == usuario.email
        assert q.atualizado_em is not None

    @pytest.mark.asyncio
    async def test_status_aguardando_equivale_a_enviar(
        self, async_db, criar_usuario, service
    ):
        usuario = await criar_usuario("incubado")
        await _semear(async_db, usuario.email, StatusEnum.pendente)

        q = await service.atualizar_plano(
            usuario, self._entrada(StatusEnum.aguardando_aprovacao)
        )

        assert q.status_questionario == StatusEnum.aguardando_aprovacao

    @pytest.mark.asyncio
    async def test_enviar_vazio_pelo_put_e_recusado_e_desfeito(
        self, async_db, criar_usuario, service
    ):
        usuario = await criar_usuario("incubado")
        await _semear(async_db, usuario.email, StatusEnum.pendente, json=PREENCHIDO)

        with pytest.raises(ValidacaoNegocioError):
            await service.atualizar_plano(
                usuario, self._entrada(StatusEnum.aguardando_aprovacao, json={})
            )

        atual = (
            await async_db.execute(
                select(Questionario).where(Questionario.usuario_email == usuario.email)
            )
        ).scalar_one()
        assert atual.status_questionario == StatusEnum.pendente
        assert atual.json_questionario == PREENCHIDO

    @pytest.mark.asyncio
    @pytest.mark.parametrize("status", [StatusEnum.aprovado, StatusEnum.rejeitado])
    async def test_incubado_nao_se_aprova_nem_rejeita(
        self, async_db, criar_usuario, service, status
    ):
        usuario = await criar_usuario("incubado")
        await _semear(async_db, usuario.email, StatusEnum.pendente)

        with pytest.raises(SemPermissaoError):
            await service.atualizar_plano(usuario, self._entrada(status))

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "status", [StatusEnum.aguardando_aprovacao, StatusEnum.rejeitado]
    )
    async def test_bloqueado_em_analise_e_rejeitado(
        self, async_db, criar_usuario, service, status
    ):
        usuario = await criar_usuario("incubado")
        await _semear(async_db, usuario.email, status)

        with pytest.raises(ConflitoError):
            await service.atualizar_plano(usuario, self._entrada(StatusEnum.pendente))

    @pytest.mark.asyncio
    async def test_plano_aprovado_atualiza_sem_mudar_status(
        self, async_db, criar_usuario, service
    ):
        usuario = await criar_usuario("incubado")
        await _semear(async_db, usuario.email, StatusEnum.aprovado)
        novo_json = {"2": {"business_canvas": "Canvas revisado"}}

        q = await service.atualizar_plano(
            usuario, self._entrada(StatusEnum.aprovado, novo_json)
        )

        assert q.status_questionario == StatusEnum.aprovado
        assert q.json_questionario["2"]["business_canvas"] == "Canvas revisado"
        assert q.atualizado_por == usuario.email

    @pytest.mark.asyncio
    async def test_plano_aprovado_nao_muda_de_status(
        self, async_db, criar_usuario, service
    ):
        usuario = await criar_usuario("incubado")
        await _semear(async_db, usuario.email, StatusEnum.aprovado)

        with pytest.raises(ConflitoError):
            await service.atualizar_plano(usuario, self._entrada(StatusEnum.pendente))


NOTA_COM_VALOR = {
    "valor": 4,
    "texto": "Bom",
    "avaliador": "c@x.com",
    "avaliado_em": "2026-10-01",
}


class TestProtecaoDasNotas:
    async def _com_nota(self, async_db, usuario, status=StatusEnum.pendente):
        await _semear(
            async_db,
            usuario.email,
            status,
            json={"2": {"business_canvas": "v1", "nota": NOTA_COM_VALOR}},
        )

    @pytest.mark.asyncio
    async def test_put_do_incubado_nao_altera_nem_apaga_a_nota(
        self, async_db, criar_usuario, service
    ):
        usuario = await criar_usuario("incubado")
        await self._com_nota(async_db, usuario)
        forjado = {
            "2": {"business_canvas": "v2", "nota": {"valor": 5, "texto": "forjada"}}
        }

        q = await service.atualizar_plano(
            usuario,
            QuestionarioInputSchema(
                status_questionario="pendente", json_questionario=forjado
            ),
        )
        sem_nota = await service.atualizar_plano(
            usuario,
            QuestionarioInputSchema(
                status_questionario="pendente",
                json_questionario={"2": {"business_canvas": "v3"}},
            ),
        )

        assert q.json_questionario["2"]["nota"] == NOTA_COM_VALOR
        assert sem_nota.json_questionario["2"]["business_canvas"] == "v3"
        assert sem_nota.json_questionario["2"]["nota"] == NOTA_COM_VALOR

    @pytest.mark.asyncio
    async def test_put_em_plano_aprovado_tambem_preserva_a_nota(
        self, async_db, criar_usuario, service
    ):
        usuario = await criar_usuario("incubado")
        await self._com_nota(async_db, usuario, StatusEnum.aprovado)

        q = await service.atualizar_plano(
            usuario,
            QuestionarioInputSchema(
                status_questionario="aprovado",
                json_questionario={
                    "2": {"business_canvas": "revisado", "nota": {"valor": 0}}
                },
            ),
        )

        assert q.json_questionario["2"]["nota"] == NOTA_COM_VALOR

    @pytest.mark.asyncio
    async def test_reiniciar_zera_as_notas_do_novo_e_mantem_as_do_arquivado(
        self, async_db, criar_usuario, service, monkeypatch
    ):
        usuario = await criar_usuario("incubado", "ana@example.com")
        await self._com_nota(async_db, usuario, StatusEnum.rejeitado)
        monkeypatch.setattr(
            "services.ingresso.ingresso_service.arquivar_pasta", MagicMock()
        )

        novo = await service.reiniciar(usuario)

        assert novo.json_questionario["2"]["business_canvas"] == "v1"
        assert novo.json_questionario["2"]["nota"] == NOTA_VAZIA
        arquivado = await async_db.get(Questionario, "ana@example.com_1")
        assert arquivado.json_questionario["2"]["nota"] == NOTA_COM_VALOR

    @pytest.mark.asyncio
    async def test_etapa_1_nao_ganha_nota_no_put_nem_no_reiniciar(
        self, async_db, criar_usuario, service, monkeypatch
    ):
        usuario = await criar_usuario("incubado", "ana@example.com")
        await self._com_nota(async_db, usuario)

        q = await service.atualizar_plano(
            usuario,
            QuestionarioInputSchema(
                status_questionario="pendente",
                json_questionario={
                    "1": {"cnpj": "1", "nota": {"valor": 5, "texto": "forjada"}},
                    "2": {"business_canvas": "v2"},
                },
            ),
        )

        assert q.json_questionario["1"] == {"cnpj": "1"}
        assert q.json_questionario["2"]["nota"] == NOTA_COM_VALOR

        q.status_questionario = StatusEnum.rejeitado
        await async_db.commit()
        monkeypatch.setattr(
            "services.ingresso.ingresso_service.arquivar_pasta", MagicMock()
        )
        novo = await service.reiniciar(usuario)

        assert "nota" not in novo.json_questionario["1"]
        assert novo.json_questionario["2"]["nota"] == NOTA_VAZIA


class TestAnexosEEConcorrencia:
    @staticmethod
    def _entrada(json):
        return QuestionarioInputSchema(
            status_questionario="pendente", json_questionario=json
        )

    @pytest.mark.asyncio
    async def test_put_com_base64_da_422_e_nao_grava(
        self, async_db, criar_usuario, service
    ):
        usuario = await criar_usuario("incubado")
        await _semear(async_db, usuario.email, StatusEnum.pendente)
        json = {"6": {"arquivos": [{"nome": "b.pdf", "conteudo_base64": "JVBERi0="}]}}

        with pytest.raises(ValidacaoNegocioError, match="POST /arquivos/questionario"):
            await service.atualizar_plano(usuario, self._entrada(json))

        gravado = await async_db.get(Questionario, usuario.email)
        assert gravado.json_questionario == PREENCHIDO

    @pytest.mark.asyncio
    async def test_put_nao_inclui_nem_remove_nem_altera_referencias(
        self, async_db, criar_usuario, service
    ):
        usuario = await criar_usuario("incubado", "ana@example.com")
        referencia = {
            "nome": "b.pdf",
            "tipo": "application/pdf",
            "tamanho": 10,
            "caminho": "anaexamplecom/6/b.pdf",
        }
        await _semear(
            async_db,
            usuario.email,
            StatusEnum.pendente,
            json={"6": {"fornecedores": "x", "arquivos": [referencia]}},
        )
        forjado = {
            "6": {
                "fornecedores": "y",
                "arquivos": [{"nome": "outro.pdf", "caminho": "alheio/6/outro.pdf"}],
            },
            "9": {"observacoes": "z", "arquivos": [{"nome": "n.pdf", "caminho": "n"}]},
        }

        q = await service.atualizar_plano(usuario, self._entrada(forjado))
        assert q.json_questionario["6"]["fornecedores"] == "y"
        assert q.json_questionario["6"]["arquivos"] == [referencia]
        assert q.json_questionario["9"]["arquivos"] == []

        sem_lista = await service.atualizar_plano(
            usuario, self._entrada({"6": {"fornecedores": "w"}})
        )
        assert sem_lista.json_questionario["6"]["arquivos"] == [referencia]

    @pytest.mark.asyncio
    async def test_put_bloqueia_a_linha_para_atualizar(
        self, async_db, criar_usuario, email_mock
    ):
        usuario = await criar_usuario("incubado")
        await _semear(async_db, usuario.email, StatusEnum.pendente)
        repo = IngressoRepository(async_db)
        chamadas = []
        original = repo.buscar_para_atualizar

        async def _espiao(email):
            chamadas.append(email)
            return await original(email)

        repo.buscar_para_atualizar = _espiao
        service = IngressoService(async_db, email_service=email_mock, repository=repo)

        await service.atualizar_plano(usuario, self._entrada(PREENCHIDO))

        assert chamadas == [usuario.email]
