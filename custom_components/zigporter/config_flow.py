"""Config flow for Zigporter integration."""

from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry, ConfigFlow, OptionsFlow
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult

from .const import (
    BACKEND_AUTO,
    BACKEND_Z2M,
    BACKEND_ZHA,
    CONF_BACKEND,
    CONF_CACHE_TTL,
    CONF_CRITICAL_LQI,
    CONF_MQTT_TOPIC,
    CONF_SCAN_TIMEOUT,
    CONF_WARN_LQI,
    DEFAULT_CACHE_TTL,
    DEFAULT_CRITICAL_LQI,
    DEFAULT_MQTT_TOPIC,
    DEFAULT_SCAN_TIMEOUT,
    DEFAULT_WARN_LQI,
    DOMAIN,
)


class ZigporterConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Zigporter."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Handle the initial configuration step."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            return self.async_create_entry(title="Zigporter", data=user_input)

        schema = vol.Schema(
            {
                vol.Required(CONF_BACKEND, default=BACKEND_AUTO): vol.In(
                    {
                        BACKEND_AUTO: "Auto-detect",
                        BACKEND_Z2M: "Zigbee2MQTT",
                        BACKEND_ZHA: "ZHA",
                    }
                ),
                vol.Optional(CONF_MQTT_TOPIC, default=DEFAULT_MQTT_TOPIC): str,
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        """Get the options flow handler."""
        return ZigporterOptionsFlow()


class ZigporterOptionsFlow(OptionsFlow):
    """Handle Zigporter options."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Manage the options."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        current = self.config_entry.options
        schema = vol.Schema(
            {
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
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)
