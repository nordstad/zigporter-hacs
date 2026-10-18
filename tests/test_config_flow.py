"""Tests for config flow — validates schema and defaults."""

import re
from unittest.mock import AsyncMock, MagicMock

import pytest
import voluptuous as vol

from custom_components.zigporter.config_flow import (
    ZigporterConfigFlow,
    ZigporterOptionsFlow,
    _find_conflict,
    _normalize_topic,
)
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
    DOMAIN,
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
            int, vol.Range(min=60, max=1200)
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
            OPTIONS_SCHEMA({CONF_BACKEND: BACKEND_Z2M, CONF_SCAN_TIMEOUT: 1201})

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


def _entry(entry_id, backend=BACKEND_Z2M, topic="zigbee2mqtt", options=None):
    entry = MagicMock()
    entry.entry_id = entry_id
    entry.data = {CONF_BACKEND: backend, CONF_MQTT_TOPIC: topic}
    entry.options = options or {}
    return entry


class TestNormalizeTopic:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("zigbee2mqtt/b1", "zigbee2mqtt/b1"),
            ("  zigbee2mqtt/b1/ ", "zigbee2mqtt/b1"),
            ("/zigbee2mqtt/", "zigbee2mqtt"),
            ("", DEFAULT_MQTT_TOPIC),
            (None, DEFAULT_MQTT_TOPIC),
        ],
    )
    def test_normalizes(self, raw, expected):
        assert _normalize_topic(raw) == expected


class TestFindConflict:
    def test_no_entries_no_conflict(self):
        assert _find_conflict([], BACKEND_Z2M, "zigbee2mqtt/b1") is None

    def test_different_topic_is_allowed(self):
        entries = [_entry("a", topic="zigbee2mqtt/b1")]
        assert _find_conflict(entries, BACKEND_Z2M, "zigbee2mqtt/b2") is None

    def test_same_topic_conflicts(self):
        entries = [_entry("a", topic="zigbee2mqtt/b1")]
        assert _find_conflict(entries, BACKEND_Z2M, "zigbee2mqtt/b1") == "topic_already_configured"

    def test_options_topic_overrides_data(self):
        entries = [_entry("a", topic="zigbee2mqtt", options={CONF_MQTT_TOPIC: "zigbee2mqtt/b1/"})]
        assert _find_conflict(entries, BACKEND_Z2M, "zigbee2mqtt/b1") == "topic_already_configured"
        assert _find_conflict(entries, BACKEND_Z2M, "zigbee2mqtt") is None

    def test_second_zha_conflicts(self):
        entries = [_entry("a", backend=BACKEND_ZHA)]
        assert _find_conflict(entries, BACKEND_ZHA, None) == "zha_already_configured"

    def test_z2m_and_zha_coexist(self):
        entries = [_entry("a", backend=BACKEND_ZHA)]
        assert _find_conflict(entries, BACKEND_Z2M, "zigbee2mqtt") is None
        entries = [_entry("a", topic="zigbee2mqtt")]
        assert _find_conflict(entries, BACKEND_ZHA, None) is None

    def test_excludes_own_entry(self):
        entries = [_entry("a", topic="zigbee2mqtt/b1")]
        assert _find_conflict(entries, BACKEND_Z2M, "zigbee2mqtt/b1", exclude_entry_id="a") is None

    def test_entry_without_backend_never_conflicts(self):
        entry = MagicMock(entry_id="a", data={}, options={})
        assert _find_conflict([entry], BACKEND_Z2M, "zigbee2mqtt") is None
        assert _find_conflict([entry], BACKEND_ZHA, None) is None


def _config_flow(existing, mqtt=True, zha=True):
    flow = ZigporterConfigFlow()
    flow.hass = MagicMock()
    flow.hass.config_entries.async_entries = MagicMock(
        side_effect=lambda domain: {
            "mqtt": [object()] if mqtt else [],
            "zha": [object()] if zha else [],
        }[domain]
    )
    flow._async_current_entries = MagicMock(return_value=existing)
    flow.async_set_unique_id = AsyncMock()
    flow._abort_if_unique_id_configured = MagicMock()
    flow.async_create_entry = MagicMock(side_effect=lambda **kw: {"type": "create_entry", **kw})
    flow.async_show_form = MagicMock(side_effect=lambda **kw: {"type": "form", **kw})
    return flow


class TestConfigFlowUserStep:
    async def test_shows_form_without_input(self):
        result = await _config_flow([]).async_step_user()
        assert result["type"] == "form"
        assert result["errors"] == {}

    async def test_first_entry_keeps_plain_title(self):
        flow = _config_flow([])
        result = await flow.async_step_user(
            {CONF_BACKEND: BACKEND_Z2M, CONF_MQTT_TOPIC: "zigbee2mqtt"}
        )

        assert result["title"] == "Zigporter"
        assert result["data"][CONF_MQTT_TOPIC] == "zigbee2mqtt"
        flow.async_set_unique_id.assert_awaited_once_with("z2m:zigbee2mqtt")

    async def test_second_bridge_is_allowed_and_named_by_topic(self):
        flow = _config_flow([_entry("a", topic="zigbee2mqtt/b1")])
        result = await flow.async_step_user(
            {CONF_BACKEND: BACKEND_Z2M, CONF_MQTT_TOPIC: " zigbee2mqtt/b2/ "}
        )

        assert result["title"] == "Zigporter (zigbee2mqtt/b2)"
        assert result["data"][CONF_MQTT_TOPIC] == "zigbee2mqtt/b2"
        flow.async_set_unique_id.assert_awaited_once_with("z2m:zigbee2mqtt/b2")

    async def test_duplicate_topic_is_rejected(self):
        flow = _config_flow([_entry("a", topic="zigbee2mqtt/b1")])
        result = await flow.async_step_user(
            {CONF_BACKEND: BACKEND_Z2M, CONF_MQTT_TOPIC: "zigbee2mqtt/b1"}
        )

        assert result["type"] == "form"
        assert result["errors"] == {"base": "topic_already_configured"}
        flow.async_create_entry.assert_not_called()

    async def test_legacy_entry_blocks_its_own_topic(self):
        legacy = _entry("a", topic="zigbee2mqtt")
        legacy.unique_id = DOMAIN
        flow = _config_flow([legacy])
        result = await flow.async_step_user(
            {CONF_BACKEND: BACKEND_Z2M, CONF_MQTT_TOPIC: "zigbee2mqtt"}
        )

        assert result["errors"] == {"base": "topic_already_configured"}

    async def test_second_zha_is_rejected(self):
        flow = _config_flow([_entry("a", backend=BACKEND_ZHA)])
        result = await flow.async_step_user({CONF_BACKEND: BACKEND_ZHA})

        assert result["errors"] == {"base": "zha_already_configured"}

    async def test_zha_alongside_z2m(self):
        flow = _config_flow([_entry("a")])
        result = await flow.async_step_user({CONF_BACKEND: BACKEND_ZHA})

        assert result["title"] == "Zigporter (ZHA)"
        flow.async_set_unique_id.assert_awaited_once_with("zha")

    async def test_requires_mqtt_for_z2m(self):
        flow = _config_flow([], mqtt=False)
        result = await flow.async_step_user({CONF_BACKEND: BACKEND_Z2M})

        assert result["errors"] == {"base": "mqtt_not_configured"}

    async def test_requires_zha_integration(self):
        flow = _config_flow([], zha=False)
        result = await flow.async_step_user({CONF_BACKEND: BACKEND_ZHA})

        assert result["errors"] == {"base": "zha_not_configured"}


def _options_flow(this_entry, all_entries):
    flow = ZigporterOptionsFlow()
    flow.config_entry = this_entry
    flow.hass = MagicMock()
    flow.hass.config_entries.async_entries = MagicMock(return_value=all_entries)
    flow.async_create_entry = MagicMock(side_effect=lambda **kw: {"type": "create_entry", **kw})
    flow.async_show_form = MagicMock(side_effect=lambda **kw: {"type": "form", **kw})
    return flow


class TestOptionsFlowConflicts:
    async def test_topic_collision_is_rejected(self):
        one = _entry("a", topic="zigbee2mqtt/b1")
        two = _entry("b", topic="zigbee2mqtt/b2")
        flow = _options_flow(two, [one, two])

        result = await flow.async_step_init(
            {CONF_BACKEND: BACKEND_Z2M, CONF_MQTT_TOPIC: "zigbee2mqtt/b1"}
        )

        assert result["errors"] == {"base": "topic_already_configured"}

    async def test_switching_to_second_zha_is_rejected(self):
        zha = _entry("a", backend=BACKEND_ZHA)
        z2m = _entry("b")
        flow = _options_flow(z2m, [zha, z2m])

        result = await flow.async_step_init({CONF_BACKEND: BACKEND_ZHA})

        assert result["errors"] == {"base": "zha_already_configured"}

    async def test_keeping_own_topic_is_accepted_and_normalized(self):
        one = _entry("a", topic="zigbee2mqtt/b1")
        two = _entry("b", topic="zigbee2mqtt/b2")
        flow = _options_flow(two, [one, two])

        result = await flow.async_step_init(
            {CONF_BACKEND: BACKEND_Z2M, CONF_MQTT_TOPIC: "zigbee2mqtt/b2/"}
        )

        assert result["type"] == "create_entry"
        assert result["data"][CONF_MQTT_TOPIC] == "zigbee2mqtt/b2"

    async def test_free_topic_change_is_accepted(self):
        one = _entry("a", topic="zigbee2mqtt/b1")
        two = _entry("b", topic="zigbee2mqtt/b2")
        flow = _options_flow(two, [one, two])

        result = await flow.async_step_init(
            {CONF_BACKEND: BACKEND_Z2M, CONF_MQTT_TOPIC: "zigbee2mqtt/b3"}
        )

        assert result["type"] == "create_entry"

    async def test_color_errors_still_reported(self):
        one = _entry("a")
        flow = _options_flow(one, [one])

        result = await flow.async_step_init(
            {CONF_BACKEND: BACKEND_Z2M, CONF_HOP_COLOR_1: "#112233"}
        )

        assert result["errors"] == {"base": "incomplete_palette"}

    async def test_shows_form_without_input(self):
        one = _entry("a")
        result = await _options_flow(one, [one]).async_step_init()

        assert result["type"] == "form"
