"""Shared test fixtures for Zigporter HACS tests."""

import sys
from types import ModuleType
from unittest.mock import MagicMock

import pytest


def _install_ha_stubs() -> None:
    """Install minimal homeassistant stub modules so tests run without the full HA package.

    Only the symbols actually imported at module level in __init__.py and
    websocket_api.py are stubbed. Everything else stays as MagicMock.
    """

    def _identity(func):
        return func

    # homeassistant.core
    core = ModuleType("homeassistant.core")
    core.HomeAssistant = object
    core.callback = _identity

    # homeassistant.config_entries — ConfigFlow uses domain= kwarg in class definition
    class _ConfigFlowBase:
        def __init_subclass__(cls, domain=None, **kwargs):
            super().__init_subclass__(**kwargs)

    config_entries = ModuleType("homeassistant.config_entries")
    config_entries.ConfigEntry = object
    config_entries.ConfigFlow = _ConfigFlowBase
    config_entries.ConfigFlowResult = object
    config_entries.OptionsFlow = object

    # homeassistant.components.websocket_api — decorators execute at import time
    ws_api = ModuleType("homeassistant.components.websocket_api")
    ws_api.websocket_command = lambda schema: _identity
    ws_api.async_response = _identity
    ws_api.async_register_command = MagicMock()
    ws_api.ActiveConnection = object

    # homeassistant.components.mqtt
    mqtt = ModuleType("homeassistant.components.mqtt")
    mqtt.async_subscribe = MagicMock()
    mqtt.async_publish = MagicMock()

    # homeassistant.components.frontend / http
    frontend = ModuleType("homeassistant.components.frontend")
    frontend.add_extra_js_url = MagicMock()
    http_mod = ModuleType("homeassistant.components.http")
    http_mod.StaticPathConfig = MagicMock

    # homeassistant.helpers.config_validation
    cv = ModuleType("homeassistant.helpers.config_validation")
    cv.config_entry_only_config_schema = lambda domain: {}

    stubs = {
        "homeassistant": ModuleType("homeassistant"),
        "homeassistant.components": ModuleType("homeassistant.components"),
        "homeassistant.components.frontend": frontend,
        "homeassistant.components.http": http_mod,
        "homeassistant.components.mqtt": mqtt,
        "homeassistant.components.websocket_api": ws_api,
        "homeassistant.config_entries": config_entries,
        "homeassistant.core": core,
        "homeassistant.helpers": ModuleType("homeassistant.helpers"),
        "homeassistant.helpers.config_validation": cv,
    }
    for name, mod in stubs.items():
        sys.modules.setdefault(name, mod)


_install_ha_stubs()


@pytest.fixture
def sample_z2m_nodes():
    """Sample Z2M node data — coordinator + 2 routers + 1 end device."""
    return {
        "0x00124b0001abcdef": {
            "ieeeAddr": "0x00124b0001abcdef",
            "friendlyName": "Coordinator",
            "type": "Coordinator",
        },
        "0x00124b0002aaaaaa": {
            "ieeeAddr": "0x00124b0002aaaaaa",
            "friendlyName": "Living Room Router",
            "type": "Router",
        },
        "0x00124b0003bbbbbb": {
            "ieeeAddr": "0x00124b0003bbbbbb",
            "friendlyName": "Kitchen Router",
            "type": "Router",
        },
        "0x00124b0004cccccc": {
            "ieeeAddr": "0x00124b0004cccccc",
            "friendlyName": "Bedroom Sensor",
            "type": "EndDevice",
        },
    }


@pytest.fixture
def sample_z2m_links():
    """Sample Z2M link data with bidirectional LQI."""
    return [
        {
            "source": {"ieeeAddr": "0x00124b0002aaaaaa"},
            "target": {"ieeeAddr": "0x00124b0001abcdef"},
            "lqi": 180,
        },
        {
            "source": {"ieeeAddr": "0x00124b0001abcdef"},
            "target": {"ieeeAddr": "0x00124b0002aaaaaa"},
            "lqi": 165,
        },
        {
            "source": {"ieeeAddr": "0x00124b0003bbbbbb"},
            "target": {"ieeeAddr": "0x00124b0001abcdef"},
            "lqi": 120,
        },
        {
            "source": {"ieeeAddr": "0x00124b0001abcdef"},
            "target": {"ieeeAddr": "0x00124b0003bbbbbb"},
            "lqi": 95,
        },
        {
            "source": {"ieeeAddr": "0x00124b0004cccccc"},
            "target": {"ieeeAddr": "0x00124b0002aaaaaa"},
            "lqi": 140,
        },
        {
            "source": {"ieeeAddr": "0x00124b0002aaaaaa"},
            "target": {"ieeeAddr": "0x00124b0004cccccc"},
            "lqi": 130,
        },
    ]


@pytest.fixture
def sample_zha_devices():
    """Sample ZHA device list with neighbor tables."""
    return [
        {
            "ieee": "00:12:4b:00:01:ab:cd:ef",
            "name": "Coordinator",
            "device_type": "Coordinator",
            "lqi": 255,
            "neighbors": [
                {"ieee": "00:12:4b:00:02:aa:aa:aa", "lqi": "180", "relationship": "Child"},
                {"ieee": "00:12:4b:00:03:bb:bb:bb", "lqi": "95", "relationship": "Child"},
            ],
        },
        {
            "ieee": "00:12:4b:00:02:aa:aa:aa",
            "name": "Living Room Router",
            "device_type": "Router",
            "lqi": 180,
            "neighbors": [
                {"ieee": "00:12:4b:00:01:ab:cd:ef", "lqi": "165", "relationship": "Parent"},
                {"ieee": "00:12:4b:00:04:cc:cc:cc", "lqi": "140", "relationship": "Child"},
            ],
        },
        {
            "ieee": "00:12:4b:00:03:bb:bb:bb",
            "name": "Kitchen Router",
            "device_type": "Router",
            "lqi": 95,
            "neighbors": [
                {"ieee": "00:12:4b:00:01:ab:cd:ef", "lqi": "120", "relationship": "Parent"},
            ],
        },
        {
            "ieee": "00:12:4b:00:04:cc:cc:cc",
            "name": "Bedroom Sensor",
            "device_type": "EndDevice",
            "lqi": 140,
            "neighbors": [
                {"ieee": "00:12:4b:00:02:aa:aa:aa", "lqi": "130", "relationship": "Parent"},
            ],
        },
    ]


@pytest.fixture
def sample_zha_devices_no_neighbors():
    """Sample ZHA device list without neighbor data (flat topology)."""
    return [
        {
            "ieee": "00:12:4b:00:01:ab:cd:ef",
            "name": "Coordinator",
            "device_type": "Coordinator",
            "lqi": 255,
        },
        {
            "ieee": "00:12:4b:00:02:aa:aa:aa",
            "name": "Living Room Router",
            "device_type": "Router",
            "lqi": 180,
        },
        {
            "ieee": "00:12:4b:00:04:cc:cc:cc",
            "name": "Bedroom Sensor",
            "device_type": "EndDevice",
            "lqi": 90,
        },
    ]
