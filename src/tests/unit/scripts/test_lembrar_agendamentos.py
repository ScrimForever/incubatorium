from datetime import datetime, time

from src.scripts.lembrar_agendamentos import segundos_ate
from src.shared.datas import FUSO


def test_antes_das_13h_espera_ate_hoje():
    agora = datetime(2026, 11, 3, 12, 0, tzinfo=FUSO)
    assert segundos_ate(time(13), agora) == 3600


def test_depois_das_13h_espera_ate_amanha():
    agora = datetime(2026, 11, 3, 13, 0, tzinfo=FUSO)
    assert segundos_ate(time(13), agora) == 24 * 3600
