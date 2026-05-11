"""Zigporter integration for Home Assistant — Zigbee network map."""

from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .websocket_api import async_register_websocket_commands


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Zigporter from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = {"cache": None, "cache_time": None}

    static_dir = Path(__file__).parent / "static"
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                url_path="/zigporter/zigporter-network-map-card.js",
                path=str(static_dir / "zigporter-network-map-card.js"),
                cache_headers=True,
            )
        ]
    )

    async_register_websocket_commands(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a Zigporter config entry."""
    hass.data[DOMAIN].pop(entry.entry_id, None)
    return True
