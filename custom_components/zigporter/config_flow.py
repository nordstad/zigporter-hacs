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
    CONF_NAME,
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

_HEX_COLOR_RE = re.compile(r"^#?[0-9A-Fa-f]{6}$")


def _normalize_topic(topic: str | None) -> str:
    """Strip whitespace and surrounding slashes from an MQTT topic prefix."""
    return (topic or "").strip().strip("/") or DEFAULT_MQTT_TOPIC


def _unique_id(backend: str, topic: str) -> str:
    """Build the unique id for a new entry. ZHA is a singleton; Z2M is keyed by topic."""
    return "zha" if backend == BACKEND_ZHA else f"z2m:{topic}"


def _entry_identity(entry: ConfigEntry) -> tuple[str | None, str | None]:
    """Return the (backend, topic) an entry currently uses. ZHA has no topic."""
    backend = entry.options.get(CONF_BACKEND, entry.data.get(CONF_BACKEND))
    if backend != BACKEND_Z2M:
        return backend, None
    topic = entry.options.get(CONF_MQTT_TOPIC, entry.data.get(CONF_MQTT_TOPIC))
    return backend, _normalize_topic(topic)


def _find_conflict(
    entries: list[ConfigEntry],
    backend: str,
    topic: str | None,
    exclude_entry_id: str | None = None,
) -> str | None:
    """Return an error key if another entry already uses this backend/topic."""
    for entry in entries:
        if entry.entry_id == exclude_entry_id:
            continue
        other_backend, other_topic = _entry_identity(entry)
        if backend == BACKEND_ZHA and other_backend == BACKEND_ZHA:
            return "zha_already_configured"
        if backend == BACKEND_Z2M and other_backend == BACKEND_Z2M and other_topic == topic:
            return "topic_already_configured"
    return None


class ZigporterConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Zigporter."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Handle the initial configuration step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            backend = user_input[CONF_BACKEND]
            topic = _normalize_topic(user_input.get(CONF_MQTT_TOPIC))
            existing = self._async_current_entries()
            if backend == BACKEND_Z2M and not self.hass.config_entries.async_entries("mqtt"):
                errors["base"] = "mqtt_not_configured"
            elif backend == BACKEND_ZHA and not self.hass.config_entries.async_entries("zha"):
                errors["base"] = "zha_not_configured"
            elif conflict := _find_conflict(existing, backend, topic):
                errors["base"] = conflict
            else:
                title = "Zigporter (ZHA)" if backend == BACKEND_ZHA else f"Zigporter ({topic})"
                if not existing:
                    title = "Zigporter"
                title = (user_input.get(CONF_NAME) or "").strip() or title
                await self.async_set_unique_id(_unique_id(backend, topic))
                self._abort_if_unique_id_configured()
                data = {k: v for k, v in user_input.items() if k != CONF_NAME}
                return self.async_create_entry(title=title, data={**data, CONF_MQTT_TOPIC: topic})

        schema = vol.Schema(
            {
                vol.Required(CONF_BACKEND): vol.In(
                    {
                        BACKEND_Z2M: "Zigbee2MQTT",
                        BACKEND_ZHA: "ZHA",
                    }
                ),
                vol.Optional(CONF_MQTT_TOPIC, default=DEFAULT_MQTT_TOPIC): str,
                vol.Optional(CONF_NAME): str,
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
                user_input.get(CONF_HOP_COLOR_1, "").strip(),
                user_input.get(CONF_HOP_COLOR_2, "").strip(),
                user_input.get(CONF_HOP_COLOR_3, "").strip(),
                user_input.get(CONF_HOP_COLOR_4, "").strip(),
            ]
            filled = [c for c in color_fields if c]
            if 0 < len(filled) < 4:
                errors["base"] = "incomplete_palette"
            elif any(c and not _HEX_COLOR_RE.match(c) for c in filled):
                errors["base"] = "invalid_color"
            elif conflict := _find_conflict(
                self.hass.config_entries.async_entries(DOMAIN),
                user_input[CONF_BACKEND],
                _normalize_topic(user_input.get(CONF_MQTT_TOPIC)),
                exclude_entry_id=self.config_entry.entry_id,
            ):
                errors["base"] = conflict
            else:
                topic = _normalize_topic(user_input.get(CONF_MQTT_TOPIC))
                user_input[CONF_MQTT_TOPIC] = topic
                # Keep unique ids in sync with what an entry uses, so a freed topic can be
                # reused. The original entry (unique id == DOMAIN) is never changed: its
                # cache location depends on it.
                new_unique_id = _unique_id(user_input[CONF_BACKEND], topic)
                if (
                    self.config_entry.unique_id != DOMAIN
                    and self.config_entry.unique_id != new_unique_id
                ):
                    self.hass.config_entries.async_update_entry(
                        self.config_entry, unique_id=new_unique_id
                    )
                for key in (CONF_HOP_COLOR_1, CONF_HOP_COLOR_2, CONF_HOP_COLOR_3, CONF_HOP_COLOR_4):
                    val = user_input.get(key, "").strip()
                    if val and not val.startswith("#"):
                        val = f"#{val}"
                    user_input[key] = val.upper() if val else ""
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
                ): vol.All(int, vol.Range(min=60, max=1200)),
                vol.Optional(
                    CONF_HOP_COLOR_1,
                    description={"suggested_value": current.get(CONF_HOP_COLOR_1, "")},
                ): str,
                vol.Optional(
                    CONF_HOP_COLOR_2,
                    description={"suggested_value": current.get(CONF_HOP_COLOR_2, "")},
                ): str,
                vol.Optional(
                    CONF_HOP_COLOR_3,
                    description={"suggested_value": current.get(CONF_HOP_COLOR_3, "")},
                ): str,
                vol.Optional(
                    CONF_HOP_COLOR_4,
                    description={"suggested_value": current.get(CONF_HOP_COLOR_4, "")},
                ): str,
                vol.Optional(
                    CONF_HOP_OPACITY,
                    default=current.get(CONF_HOP_OPACITY, DEFAULT_HOP_OPACITY),
                ): vol.All(vol.Coerce(float), vol.Range(min=0.1, max=1.0)),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema, errors=errors)
