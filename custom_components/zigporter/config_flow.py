"""Config flow for Zigporter integration."""

import re
from typing import Any

import voluptuous as vol
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.core import callback

from .const import (
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
)

_HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _validate_hex_color(value: str) -> str:
    """Validate optional hex color — empty string means use default."""
    if value == "":
        return value
    if not _HEX_COLOR_RE.match(value):
        raise vol.Invalid(f"Invalid color format: {value}. Use #RRGGBB.")
    return value.upper()


class ZigporterConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Zigporter."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Handle the initial configuration step."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        errors: dict[str, str] = {}

        if user_input is not None:
            backend = user_input[CONF_BACKEND]
            if backend == BACKEND_Z2M and not self.hass.config_entries.async_entries("mqtt"):
                errors["base"] = "mqtt_not_configured"
            elif backend == BACKEND_ZHA and not self.hass.config_entries.async_entries("zha"):
                errors["base"] = "zha_not_configured"
            else:
                return self.async_create_entry(title="Zigporter", data=user_input)

        schema = vol.Schema(
            {
                vol.Required(CONF_BACKEND): vol.In(
                    {
                        BACKEND_Z2M: "Zigbee2MQTT",
                        BACKEND_ZHA: "ZHA",
                    }
                ),
                vol.Optional(CONF_MQTT_TOPIC, default=DEFAULT_MQTT_TOPIC): str,
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        """Get the options flow handler."""
        return ZigporterOptionsFlow()


class ZigporterOptionsFlow(OptionsFlow):
    """Handle Zigporter options."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Manage the options."""
        errors: dict[str, str] = {}

        if user_input is not None:
            color_fields = [
                user_input.get(CONF_HOP_COLOR_1, ""),
                user_input.get(CONF_HOP_COLOR_2, ""),
                user_input.get(CONF_HOP_COLOR_3, ""),
                user_input.get(CONF_HOP_COLOR_4, ""),
            ]
            filled = [c for c in color_fields if c]
            if 0 < len(filled) < 4:
                errors["base"] = "incomplete_palette"
            else:
                return self.async_create_entry(title="", data=user_input)

        data = self.config_entry.data
        current = self.config_entry.options
        schema = vol.Schema(
            {
                vol.Required(
                    CONF_BACKEND,
                    default=current.get(CONF_BACKEND, data.get(CONF_BACKEND, BACKEND_Z2M)),
                ): vol.In(
                    {
                        BACKEND_Z2M: "Zigbee2MQTT",
                        BACKEND_ZHA: "ZHA",
                    }
                ),
                vol.Optional(
                    CONF_MQTT_TOPIC,
                    default=current.get(
                        CONF_MQTT_TOPIC, data.get(CONF_MQTT_TOPIC, DEFAULT_MQTT_TOPIC)
                    ),
                ): str,
                vol.Optional(
                    CONF_WARN_LQI,
                    default=current.get(CONF_WARN_LQI, DEFAULT_WARN_LQI),
                ): vol.All(int, vol.Range(min=1, max=255)),
                vol.Optional(
                    CONF_CRITICAL_LQI,
                    default=current.get(CONF_CRITICAL_LQI, DEFAULT_CRITICAL_LQI),
                ): vol.All(int, vol.Range(min=1, max=255)),
                vol.Optional(
                    CONF_CACHE_TTL,
                    default=current.get(CONF_CACHE_TTL, DEFAULT_CACHE_TTL),
                ): vol.All(int, vol.Range(min=0, max=3600)),
                vol.Optional(
                    CONF_SCAN_TIMEOUT,
                    default=current.get(CONF_SCAN_TIMEOUT, DEFAULT_SCAN_TIMEOUT),
                ): vol.All(int, vol.Range(min=60, max=600)),
                vol.Optional(
                    CONF_HOP_COLOR_1,
                    default=current.get(CONF_HOP_COLOR_1, ""),
                ): _validate_hex_color,
                vol.Optional(
                    CONF_HOP_COLOR_2,
                    default=current.get(CONF_HOP_COLOR_2, ""),
                ): _validate_hex_color,
                vol.Optional(
                    CONF_HOP_COLOR_3,
                    default=current.get(CONF_HOP_COLOR_3, ""),
                ): _validate_hex_color,
                vol.Optional(
                    CONF_HOP_COLOR_4,
                    default=current.get(CONF_HOP_COLOR_4, ""),
                ): _validate_hex_color,
                vol.Optional(
                    CONF_HOP_OPACITY,
                    default=current.get(CONF_HOP_OPACITY, DEFAULT_HOP_OPACITY),
                ): vol.All(vol.Coerce(float), vol.Range(min=0.1, max=1.0)),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema, errors=errors)
