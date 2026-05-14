"""Tests for config flow — validates schema and defaults."""

from custom_components.zigporter.const import (
    BACKEND_AUTO,
    BACKEND_Z2M,
    BACKEND_ZHA,
    CONF_BACKEND,
    CONF_CACHE_TTL,
    CONF_CRITICAL_LQI,
    CONF_MQTT_TOPIC,
    CONF_WARN_LQI,
    DEFAULT_CACHE_TTL,
    DEFAULT_CRITICAL_LQI,
    DEFAULT_MQTT_TOPIC,
    DEFAULT_WARN_LQI,
)


class TestConfigFlowConstants:
    def test_backend_values(self):
        assert BACKEND_AUTO == "auto"
        assert BACKEND_Z2M == "zigbee2mqtt"
        assert BACKEND_ZHA == "zha"

    def test_default_values(self):
        assert DEFAULT_MQTT_TOPIC == "zigbee2mqtt"
        assert DEFAULT_WARN_LQI == 50
        assert DEFAULT_CRITICAL_LQI == 20
        assert DEFAULT_CACHE_TTL == 0

    def test_config_keys_are_strings(self):
        for key in [
            CONF_BACKEND,
            CONF_MQTT_TOPIC,
            CONF_WARN_LQI,
            CONF_CRITICAL_LQI,
            CONF_CACHE_TTL,
        ]:
            assert isinstance(key, str)
