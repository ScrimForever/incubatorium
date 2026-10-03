import pytest

from shared.exceptions import (
    ArquivoNaoEncontradoError,
    DiretorioNaoEncontradoError,
    ErroAoDeletarArquivoError,
    ErroAoFazerDownloadError,
    ErroAoListarArquivosError,
    ErroAoSalvarArquivoError,
)


class TestExceptions:
    def test_arquivo_nao_encontrado_error(self):
        """Teste da exceÃ§Ã£o ArquivoNaoEncontradoError"""
        nome_arquivo = "arquivo.txt"
        erro = ArquivoNaoEncontradoError(nome_arquivo)

        assert str(erro)
        assert isinstance(erro, Exception)

    def test_erro_ao_salvar_arquivo_error(self):
        """Teste da exceÃ§Ã£o ErroAoSalvarArquivoError"""
        nome_arquivo = "arquivo.txt"
        motivo = "EspaÃ§o em disco insuficiente"
        erro = ErroAoSalvarArquivoError(nome_arquivo, motivo)

        assert str(erro)
        assert isinstance(erro, Exception)

    def test_erro_ao_fazer_download_error(self):
        """Teste da exceÃ§Ã£o ErroAoFazerDownloadError"""
        nome_arquivo = "arquivo.txt"
        motivo = "Arquivo nÃ£o encontrado"
        erro = ErroAoFazerDownloadError(nome_arquivo, motivo)

        assert str(erro)
        assert isinstance(erro, Exception)

    def test_erro_ao_deletar_arquivo_error(self):
        """Teste da exceÃ§Ã£o ErroAoDeletarArquivoError"""
        nome_arquivo = "arquivo.txt"
        motivo = "PermissÃ£o negada"
        erro = ErroAoDeletarArquivoError(nome_arquivo, motivo)

        assert str(erro)
        assert isinstance(erro, Exception)

    def test_erro_ao_listar_arquivos_error(self):
        """Teste da exceÃ§Ã£o ErroAoListarArquivosError"""
        caminho = "/arquivos"
        motivo = "DiretÃ³rio nÃ£o existe"
        erro = ErroAoListarArquivosError(caminho, motivo)

        assert str(erro)
        assert isinstance(erro, Exception)

    def test_diretorio_nao_encontrado_error(self):
        """Teste da exceÃ§Ã£o DiretorioNaoEncontradoError"""
        caminho = "/arquivos"
        erro = DiretorioNaoEncontradoError(caminho)

        assert str(erro)
        assert isinstance(erro, Exception)

    def test_erro_chains(self):
        """Teste de encadeamento de erros"""
        try:
            raise ValueError("Erro original")
        except ValueError as e:
            erro = ErroAoSalvarArquivoError("arquivo.txt", str(e))
            assert str(erro)
            assert isinstance(erro, Exception)

    @pytest.mark.parametrize(
        "erro_class,args",
        [
            (ArquivoNaoEncontradoError, ("arquivo.txt",)),
            (ErroAoSalvarArquivoError, ("arquivo.txt", "motivo")),
            (ErroAoFazerDownloadError, ("arquivo.txt", "motivo")),
            (ErroAoDeletarArquivoError, ("arquivo.txt", "motivo")),
            (ErroAoListarArquivosError, ("/caminho", "motivo")),
            (DiretorioNaoEncontradoError, ("/caminho",)),
        ],
    )
    def test_todas_excecoes(self, erro_class, args):
        """Teste parametrizado para todas as exceÃ§Ãµes"""
        erro = erro_class(*args)
        assert isinstance(erro, Exception)
        assert str(erro)
