"""Install minimal homeassistant stub modules for scripts and tests that import
custom_components.zigporter.* without a full HA installation."""

import sys
from functools import wraps
from types import ModuleType
from unittest.mock import MagicMock


def install() -> None:
    def _identity(func):
        return func

    class _ConfigFlowBase:
        def __init_subclass__(cls, domain=None, **kwargs):
            super().__init_subclass__(**kwargs)

    exceptions = ModuleType("homeassistant.exceptions")

    class Unauthorized(Exception):
        pass

    exceptions.Unauthorized = Unauthorized

    def _require_admin(func):
        # Mirrors HA: reject non-admin users before the handler runs.
        @wraps(func)
        def with_admin(hass, connection, msg):
            user = connection.user
            if user is None or not user.is_admin:
                raise Unauthorized
            return func(hass, connection, msg)

        return with_admin

    ws_api = ModuleType("homeassistant.components.websocket_api")
    ws_api.websocket_command = lambda schema: _identity
    ws_api.async_response = _identity
    ws_api.require_admin = _require_admin
    ws_api.async_register_command = MagicMock()
    ws_api.ActiveConnection = object

    frontend = ModuleType("homeassistant.components.frontend")
    frontend.add_extra_js_url = MagicMock()

    http_mod = ModuleType("homeassistant.components.http")
    http_mod.StaticPathConfig = MagicMock

    mqtt = ModuleType("homeassistant.components.mqtt")
    mqtt.async_subscribe = MagicMock()
    mqtt.async_publish = MagicMock()
    mqtt.async_wait_for_mqtt_client = MagicMock()

    core = ModuleType("homeassistant.core")
    core.HomeAssistant = object
    core.callback = _identity

    config_entries = ModuleType("homeassistant.config_entries")
    config_entries.ConfigEntry = object
    config_entries.ConfigFlow = _ConfigFlowBase
    config_entries.ConfigFlowResult = object
    config_entries.OptionsFlow = object

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
        "homeassistant.exceptions": exceptions,
        "homeassistant.helpers": ModuleType("homeassistant.helpers"),
        "homeassistant.helpers.config_validation": cv,
    }
    for name, mod in stubs.items():
        sys.modules.setdefault(name, mod)
