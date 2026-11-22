import sentry_sdk

from src.infra.config import Settings
from src.infra.observabilidade import configurar_observabilidade


def test_sem_dsn_nao_inicializa_o_sentry():
    assert configurar_observabilidade(Settings(sentry_dsn="")) is False
    assert not sentry_sdk.is_initialized()


def test_com_dsn_inicializa_com_ambiente_e_amostragem(mocker):
    init = mocker.patch("src.infra.observabilidade.sentry_sdk.init")

    settings = Settings(
        sentry_dsn="https://abc@o0.ingest.sentry.io/1",
        sentry_traces_sample_rate=0.25,
        enviroment="producao",
    )
    assert configurar_observabilidade(settings) is True

    opcoes = init.call_args.kwargs
    assert opcoes["dsn"] == settings.sentry_dsn
    assert opcoes["environment"] == "producao"
    assert opcoes["traces_sample_rate"] == 0.25
    assert opcoes["send_default_pii"] is False
