import pytest
from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from domain.models.enums import SituacaoIncubacao
from domain.models.questionarios.questionario import Questionario, StatusEnum
from repository.ingresso.ingresso_rep import IngressoRepository
from shared.exceptions import ConflitoError


async def _semear(async_db, email, status, json=None, criado_por=None):
    questionario = Questionario(
        usuario_email=email,
        status_questionario=status,
        json_questionario=json if json is not None else {},
        criado_por=criado_por or email,
    )
    async_db.add(questionario)
    await async_db.commit()
    return questionario


async def _chaves(async_db):
    resultado = await async_db.execute(select(Questionario.usuario_email))
    return sorted(resultado.scalars().all())


class TestArquivarECriarNovo:
    @pytest.mark.asyncio
    async def test_rejeitado_vira_chave_1_e_novo_usa_a_chave_normal(
        self, async_db, criar_usuario
    ):
        usuario = await criar_usuario("incubado", "ana@example.com")
        await _semear(
            async_db,
            usuario.email,
            StatusEnum.rejeitado,
            {"1": {"nome_proponente": "Ana"}},
        )

        ordem, novo = await IngressoRepository(async_db).arquivar_e_criar_novo(
            usuario.email
        )

        assert ordem == 1
        assert await _chaves(async_db) == ["ana@example.com", "ana@example.com_1"]
        assert novo.usuario_email == "ana@example.com"
        assert novo.status_questionario == StatusEnum.pendente
        assert novo.json_questionario == {"1": {"nome_proponente": "Ana"}}
        arquivado = await IngressoRepository(async_db).buscar_questionario(
            "ana@example.com_1"
        )
        assert arquivado.status_questionario == StatusEnum.rejeitado

    @pytest.mark.asyncio
    async def test_segunda_rejeicao_gera_chave_2_e_mantem_a_1(
        self, async_db, criar_usuario
    ):
        usuario = await criar_usuario("incubado", "ana@example.com")
        await _semear(async_db, usuario.email, StatusEnum.rejeitado)
        repo = IngressoRepository(async_db)
        await repo.arquivar_e_criar_novo(usuario.email)

        vigente = await repo.buscar_questionario(usuario.email)
        vigente.status_questionario = StatusEnum.rejeitado
        await async_db.commit()
        ordem, _ = await repo.arquivar_e_criar_novo(usuario.email)

        assert ordem == 2
        assert await _chaves(async_db) == [
            "ana@example.com",
            "ana@example.com_1",
            "ana@example.com_2",
        ]

    @pytest.mark.asyncio
    async def test_so_arquiva_questionario_rejeitado(self, async_db, criar_usuario):
        usuario = await criar_usuario("incubado", "ana@example.com")
        await _semear(async_db, usuario.email, StatusEnum.pendente)

        with pytest.raises(ConflitoError):
            await IngressoRepository(async_db).arquivar_e_criar_novo(usuario.email)

        assert await _chaves(async_db) == ["ana@example.com"]

    @pytest.mark.asyncio
    async def test_falha_no_commit_desfaz_tudo(
        self, async_db, criar_usuario, monkeypatch
    ):
        usuario = await criar_usuario("incubado", "ana@example.com")
        await _semear(async_db, usuario.email, StatusEnum.rejeitado)

        async def _falha():
            raise OperationalError("commit", {}, Exception("falhou"))

        monkeypatch.setattr(async_db, "commit", _falha)
        with pytest.raises(OperationalError):
            await IngressoRepository(async_db).arquivar_e_criar_novo(usuario.email)
        monkeypatch.undo()

        assert await _chaves(async_db) == ["ana@example.com"]
        original = await IngressoRepository(async_db).buscar_questionario(
            "ana@example.com"
        )
        assert original.status_questionario == StatusEnum.rejeitado


class TestHistorico:
    @pytest.mark.asyncio
    async def test_casa_so_a_chave_exata_do_usuario(self, async_db):
        for chave in (
            "ana@example.com_1",
            "ana@example.com_2",
            "ana@example.com_x",  # sufixo não numérico
            "bana@example.com_1",  # outro usuário
            "ana@example.com.br_1",  # outro e-mail com o mesmo prefixo
            "ana@example.com",  # vigente, não é histórico
        ):
            await _semear(async_db, chave, StatusEnum.rejeitado)

        itens = await IngressoRepository(async_db).listar_historico("ana@example.com")

        assert [(ordem, q.usuario_email) for ordem, q in itens] == [
            (1, "ana@example.com_1"),
            (2, "ana@example.com_2"),
        ]

    @pytest.mark.asyncio
    async def test_underscore_no_email_nao_vira_curinga(self, async_db):
        await _semear(async_db, "a_b@example.com_1", StatusEnum.rejeitado)
        await _semear(async_db, "axb@example.com_1", StatusEnum.rejeitado)

        itens = await IngressoRepository(async_db).listar_historico("a_b@example.com")

        assert [q.usuario_email for _, q in itens] == ["a_b@example.com_1"]


class TestListarPedidos:
    @pytest.mark.asyncio
    async def test_exclui_arquivados_e_filtra_por_status(self, async_db, criar_usuario):
        ana = await criar_usuario("incubado", "ana@example.com")
        beto = await criar_usuario("incubado", "beto@example.com")
        await _semear(async_db, ana.email, StatusEnum.aguardando_aprovacao)
        await _semear(async_db, beto.email, StatusEnum.pendente)
        await _semear(async_db, "ana@example.com_1", StatusEnum.rejeitado)
        repo = IngressoRepository(async_db)

        todos = await repo.listar_pedidos()
        aguardando = await repo.listar_pedidos(StatusEnum.aguardando_aprovacao)

        assert sorted(q.usuario_email for q in todos) == [
            "ana@example.com",
            "beto@example.com",
        ]
        assert [q.usuario_email for q in aguardando] == ["ana@example.com"]


class TestGravarDecisao:
    @pytest.mark.asyncio
    async def test_aprovar_define_situacao_ativa_no_usuario(
        self, async_db, criar_usuario
    ):
        usuario = await criar_usuario("incubado", "ana@example.com")
        questionario = await _semear(
            async_db, usuario.email, StatusEnum.aguardando_aprovacao
        )

        await IngressoRepository(async_db).gravar_decisao(
            questionario, StatusEnum.aprovado, "colab@example.com"
        )

        assert questionario.status_questionario == StatusEnum.aprovado
        assert questionario.decidido_por == "colab@example.com"
        assert questionario.decidido_em is not None
        assert usuario.situacao_incubacao == SituacaoIncubacao.ativo
        assert usuario.situacao_alterada_por == "colab@example.com"

    @pytest.mark.asyncio
    async def test_rejeitar_grava_motivo_e_nao_ativa_o_usuario(
        self, async_db, criar_usuario
    ):
        usuario = await criar_usuario("incubado", "ana@example.com")
        questionario = await _semear(
            async_db, usuario.email, StatusEnum.aguardando_aprovacao
        )

        await IngressoRepository(async_db).gravar_decisao(
            questionario, StatusEnum.rejeitado, "colab@example.com", "Faltou o canvas"
        )

        assert questionario.status_questionario == StatusEnum.rejeitado
        assert questionario.motivo_decisao == "Faltou o canvas"
        assert usuario.situacao_incubacao is None
