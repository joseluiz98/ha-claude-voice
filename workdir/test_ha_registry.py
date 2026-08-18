#!/usr/bin/env python3
"""Testes do resolvedor de identidade. Rodar: python3 -m unittest test_ha_registry -v"""
import json
import os
import tempfile
import unittest

import ha_registry


def _escrever_fixture(d):
    """Monta um .storage sintético reproduzindo o incidente de 15/08."""
    ents = {"data": {"entities": [
        # A entidade que mentiu: diz "cozinha", é o QUARTO, via nuvem.
        {"entity_id": "switch.interruptor_cozinha_interruptor_1",
         "platform": "tuya", "device_id": "dev_quarto", "area_id": None,
         "name": None, "original_name": "Switch 1"},
        # A gêmea local do mesmo aparelho físico.
        {"entity_id": "switch.quarto",
         "platform": "localtuya", "device_id": "dev_quarto_local", "area_id": None,
         "name": None, "original_name": "Quarto"},
        # Gêmea local de OUTRO domínio (não acionável por turn_on/turn_off) —
        # não pode virar recomendação em preferred_twins.
        {"entity_id": "select.quarto_modo_luz",
         "platform": "localtuya", "device_id": "dev_quarto_local", "area_id": None,
         "name": None, "original_name": "Modo de luz indicadora"},
        # Entidade de NUVEM cujo device local não tem nada do mesmo domínio
        # (o local só expõe switch e select). Logo não há gêmea a recomendar e
        # is_fallback fica False — mas o aviso de nuvem precisa aparecer mesmo assim.
        {"entity_id": "light.interruptor_cozinha_luz_de_fundo",
         "platform": "tuya", "device_id": "dev_quarto", "area_id": None,
         "name": None, "original_name": "Luz de fundo"},
        # Entidade sem device nenhum.
        {"entity_id": "sensor.orfa",
         "platform": "template", "device_id": None, "area_id": None,
         "name": None, "original_name": "Órfã"},
    ]}}
    devs = {"data": {"devices": [
        {"id": "dev_quarto", "name": "Interruptor Quarto", "name_by_user": None,
         "area_id": None, "identifiers": [["tuya", "aabbccddeeff00112233"]]},
        {"id": "dev_quarto_local", "name": "Interruptor Quarto (localTuya)",
         "name_by_user": None, "area_id": "area_quarto",
         "identifiers": [["localtuya", "local_aabbccddeeff00112233"]]},
    ]}}
    areas = {"data": {"areas": [{"id": "area_quarto", "name": "Bedroom"}]}}
    for nome, dados in (("core.entity_registry", ents),
                        ("core.device_registry", devs),
                        ("core.area_registry", areas)):
        with open(os.path.join(d, nome), "w", encoding="utf-8") as fh:
            json.dump(dados, fh)


class TestGwid(unittest.TestCase):
    def test_tira_prefixo_local(self):
        dev = {"identifiers": [["localtuya", "local_abc123"]]}
        self.assertEqual(ha_registry.gwid(dev), "abc123")

    def test_mantem_id_da_nuvem(self):
        dev = {"identifiers": [["tuya", "abc123"]]}
        self.assertEqual(ha_registry.gwid(dev), "abc123")

    def test_device_sem_identifiers(self):
        self.assertIsNone(ha_registry.gwid({}))


class TestResolve(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        _escrever_fixture(self.tmp.name)
        self.idx = ha_registry.build_index(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_entidade_mentirosa_aponta_o_device_certo(self):
        """O caso exato do incidente: o id diz cozinha, o device é o quarto."""
        r = ha_registry.resolve(self.idx, "switch.interruptor_cozinha_interruptor_1")
        self.assertEqual(r["device"], "Interruptor Quarto")
        self.assertEqual(r["platform"], "tuya")

    def test_gemea_local_encontrada_pelo_gwid(self):
        r = ha_registry.resolve(self.idx, "switch.interruptor_cozinha_interruptor_1")
        self.assertEqual(r["preferred_twins"], ["switch.quarto"])
        self.assertTrue(r["is_fallback"])

    def test_preferred_twins_filtra_por_mesmo_dominio(self):
        """select não é acionável por turn_on/turn_off: não pode virar recomendação,
        mesmo sendo gêmea local do mesmo aparelho físico (mesmo gwid)."""
        r = ha_registry.resolve(self.idx, "switch.interruptor_cozinha_interruptor_1")
        self.assertEqual(r["preferred_twins"], ["switch.quarto"])
        self.assertNotIn("select.quarto_modo_luz", r["preferred_twins"])
        # continua listada em twins (twins não é filtrado, só preferred_twins)
        self.assertIn("select.quarto_modo_luz", r["twins"])

    def test_entidade_local_marcada_como_preferida(self):
        r = ha_registry.resolve(self.idx, "switch.quarto")
        self.assertTrue(r["is_preferred"])
        self.assertFalse(r["is_fallback"])
        self.assertEqual(r["area"], "Bedroom")

    def test_entidade_sem_device_nao_explode(self):
        r = ha_registry.resolve(self.idx, "sensor.orfa")
        self.assertIsNone(r["device"])
        self.assertEqual(r["twins"], [])

    def test_entidade_inexistente_nao_explode(self):
        r = ha_registry.resolve(self.idx, "switch.nao_existe")
        self.assertIsNone(r["device"])
        self.assertIsNone(r["platform"])


class TestFormatSuffix(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        _escrever_fixture(self.tmp.name)
        self.idx = ha_registry.build_index(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_fallback_avisa_qual_preferir(self):
        r = ha_registry.resolve(self.idx, "switch.interruptor_cozinha_interruptor_1")
        s = ha_registry.format_suffix(r)
        self.assertIn("Interruptor Quarto", s)
        self.assertIn("switch.quarto", s)

    def test_preferida_recebe_marca(self):
        r = ha_registry.resolve(self.idx, "switch.quarto")
        self.assertIn("PREFERIR", ha_registry.format_suffix(r))

    def test_nuvem_sem_gemea_ainda_avisa_que_e_nuvem(self):
        """O aviso de nuvem não pode depender de existir alternativa a recomendar.

        Regressão: /NUVEM estava amarrado a is_fallback, então entidade de nuvem
        sem gêmea do mesmo domínio exibia só "[tuya]" — sem sinal de que depende
        da nuvem Tuya, que é mais lenta e cai junto com a internet.
        """
        r = ha_registry.resolve(self.idx, "light.interruptor_cozinha_luz_de_fundo")
        self.assertFalse(r["is_fallback"], "sem gêmea do mesmo domínio a recomendar")
        self.assertEqual(r["preferred_twins"], [])
        s = ha_registry.format_suffix(r)
        self.assertIn("[tuya/NUVEM]", s)
        # ...e sem recomendar nada, porque não há o que recomendar.
        self.assertNotIn("prefira", s)


if __name__ == "__main__":
    unittest.main()
