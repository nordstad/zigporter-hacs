"""Tests for config flow — validates schema and defaults."""

import re

import pytest
import voluptuous as vol

from custom_components.zigporter.const import (
    BACKEND_Z2M,
    BACKEND_ZHA,
    CONF_BACKEND,
    CONF_CACHE_TTL,
    CONF_CRITICAL_LQI,
    CONF_HOP_COLOR_1,
    CONF_HOP_COLOR_2,
    CONF_HOP_COLOR_3,
    CONF_HOP_COLOR_4,
    CONF_HOP_OPACITY,
    CONF_MQTT_TOPIC,
    CONF_SCAN_TIMEOUT,
    CONF_WARN_LQI,
    DEFAULT_CACHE_TTL,
    DEFAULT_CRITICAL_LQI,
    DEFAULT_HOP_OPACITY,
    DEFAULT_MQTT_TOPIC,
    DEFAULT_SCAN_TIMEOUT,
    DEFAULT_WARN_LQI,
    _resolve_backend,
)

_HEX_COLOR_RE = re.compile(r"^#?[0-9A-Fa-f]{6}$")


def _validate_hex_color(value: str) -> str:
    if value == "":
        return value
    if not _HEX_COLOR_RE.match(value):
        raise vol.Invalid(f"Invalid color format: {value}. Use #RRGGBB.")
    if not value.startswith("#"):
        value = f"#{value}"
    return value.upper()


class TestConfigFlowConstants:
    def test_backend_values(self):
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


OPTIONS_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_BACKEND): vol.In({BACKEND_Z2M: "Zigbee2MQTT", BACKEND_ZHA: "ZHA"}),
        vol.Optional(CONF_MQTT_TOPIC, default=DEFAULT_MQTT_TOPIC): str,
        vol.Optional(CONF_WARN_LQI, default=DEFAULT_WARN_LQI): vol.All(
            int, vol.Range(min=1, max=255)
        ),
        vol.Optional(CONF_CRITICAL_LQI, default=DEFAULT_CRITICAL_LQI): vol.All(
            int, vol.Range(min=1, max=255)
        ),
        vol.Optional(CONF_CACHE_TTL, default=DEFAULT_CACHE_TTL): vol.All(
            int, vol.Range(min=0, max=3600)
        ),
        vol.Optional(CONF_SCAN_TIMEOUT, default=DEFAULT_SCAN_TIMEOUT): vol.All(
            int, vol.Range(min=60, max=600)
        ),
        vol.Optional(CONF_HOP_COLOR_1, default=""): _validate_hex_color,
        vol.Optional(CONF_HOP_COLOR_2, default=""): _validate_hex_color,
        vol.Optional(CONF_HOP_COLOR_3, default=""): _validate_hex_color,
        vol.Optional(CONF_HOP_COLOR_4, default=""): _validate_hex_color,
        vol.Optional(CONF_HOP_OPACITY, default=DEFAULT_HOP_OPACITY): vol.All(
            vol.Coerce(float), vol.Range(min=0.1, max=1.0)
        ),
    }
)


class TestOptionsFlowSchema:
    def test_accepts_valid_z2m_input(self):
        data = OPTIONS_SCHEMA(
            {
                CONF_BACKEND: BACKEND_Z2M,
                CONF_MQTT_TOPIC: "zigbee2mqtt",
                CONF_WARN_LQI: 50,
                CONF_CRITICAL_LQI: 20,
                CONF_CACHE_TTL: 0,
                CONF_SCAN_TIMEOUT: 180,
            }
        )
        assert data[CONF_BACKEND] == BACKEND_Z2M
        assert data[CONF_SCAN_TIMEOUT] == 180

    def test_accepts_valid_zha_input(self):
        data = OPTIONS_SCHEMA({CONF_BACKEND: BACKEND_ZHA})
        assert data[CONF_BACKEND] == BACKEND_ZHA
        assert data[CONF_MQTT_TOPIC] == DEFAULT_MQTT_TOPIC

    def test_rejects_invalid_backend(self):
        with pytest.raises(vol.Invalid):
            OPTIONS_SCHEMA({CONF_BACKEND: "deconz"})

    def test_rejects_warn_lqi_out_of_range(self):
        with pytest.raises(vol.Invalid):
            OPTIONS_SCHEMA({CONF_BACKEND: BACKEND_Z2M, CONF_WARN_LQI: 0})
        with pytest.raises(vol.Invalid):
            OPTIONS_SCHEMA({CONF_BACKEND: BACKEND_Z2M, CONF_WARN_LQI: 256})

    def test_rejects_critical_lqi_out_of_range(self):
        with pytest.raises(vol.Invalid):
            OPTIONS_SCHEMA({CONF_BACKEND: BACKEND_Z2M, CONF_CRITICAL_LQI: -1})

    def test_rejects_cache_ttl_out_of_range(self):
        with pytest.raises(vol.Invalid):
            OPTIONS_SCHEMA({CONF_BACKEND: BACKEND_Z2M, CONF_CACHE_TTL: 3601})

    def test_rejects_scan_timeout_too_low(self):
        with pytest.raises(vol.Invalid):
            OPTIONS_SCHEMA({CONF_BACKEND: BACKEND_Z2M, CONF_SCAN_TIMEOUT: 30})

    def test_rejects_scan_timeout_too_high(self):
        with pytest.raises(vol.Invalid):
            OPTIONS_SCHEMA({CONF_BACKEND: BACKEND_Z2M, CONF_SCAN_TIMEOUT: 601})

    def test_defaults_applied_when_optional_omitted(self):
        data = OPTIONS_SCHEMA({CONF_BACKEND: BACKEND_Z2M})
        assert data[CONF_WARN_LQI] == DEFAULT_WARN_LQI
        assert data[CONF_CRITICAL_LQI] == DEFAULT_CRITICAL_LQI
        assert data[CONF_CACHE_TTL] == DEFAULT_CACHE_TTL
        assert data[CONF_SCAN_TIMEOUT] == DEFAULT_SCAN_TIMEOUT


class TestResolveBackend:
    def test_z2m(self):
        assert _resolve_backend(BACKEND_Z2M) == BACKEND_Z2M

    def test_zha(self):
        assert _resolve_backend(BACKEND_ZHA) == BACKEND_ZHA

    def test_none_returns_none(self):
        assert _resolve_backend(None) is None

    def test_invalid_string_returns_none(self):
        assert _resolve_backend("deconz") is None

    def test_empty_string_returns_none(self):
        assert _resolve_backend("") is None


class TestHopColorValidation:
    def test_accepts_valid_hex_colors(self):
        data = OPTIONS_SCHEMA(
            {
                CONF_BACKEND: BACKEND_Z2M,
                CONF_HOP_COLOR_1: "#FF5733",
                CONF_HOP_COLOR_2: "#33FF57",
                CONF_HOP_COLOR_3: "#3357FF",
                CONF_HOP_COLOR_4: "#AABBCC",
            }
        )
        assert data[CONF_HOP_COLOR_1] == "#FF5733"
        assert data[CONF_HOP_COLOR_4] == "#AABBCC"

    def test_accepts_empty_string_as_default(self):
        data = OPTIONS_SCHEMA({CONF_BACKEND: BACKEND_Z2M, CONF_HOP_COLOR_1: ""})
        assert data[CONF_HOP_COLOR_1] == ""

    def test_accepts_missing_hash(self):
        data = OPTIONS_SCHEMA({CONF_BACKEND: BACKEND_Z2M, CONF_HOP_COLOR_1: "FF5733"})
        assert data[CONF_HOP_COLOR_1] == "#FF5733"

    def test_rejects_short_hex(self):
        with pytest.raises(vol.Invalid):
            OPTIONS_SCHEMA({CONF_BACKEND: BACKEND_Z2M, CONF_HOP_COLOR_1: "#FFF"})

    def test_rejects_invalid_chars(self):
        with pytest.raises(vol.Invalid):
            OPTIONS_SCHEMA({CONF_BACKEND: BACKEND_Z2M, CONF_HOP_COLOR_1: "#GGGGGG"})

    def test_normalizes_to_uppercase(self):
        data = OPTIONS_SCHEMA({CONF_BACKEND: BACKEND_Z2M, CONF_HOP_COLOR_1: "#abcdef"})
        assert data[CONF_HOP_COLOR_1] == "#ABCDEF"

    def test_opacity_in_range(self):
        data = OPTIONS_SCHEMA({CONF_BACKEND: BACKEND_Z2M, CONF_HOP_OPACITY: 0.5})
        assert data[CONF_HOP_OPACITY] == 0.5

    def test_opacity_rejects_zero(self):
        with pytest.raises(vol.Invalid):
            OPTIONS_SCHEMA({CONF_BACKEND: BACKEND_Z2M, CONF_HOP_OPACITY: 0.0})

    def test_opacity_rejects_above_one(self):
        with pytest.raises(vol.Invalid):
            OPTIONS_SCHEMA({CONF_BACKEND: BACKEND_Z2M, CONF_HOP_OPACITY: 1.5})
