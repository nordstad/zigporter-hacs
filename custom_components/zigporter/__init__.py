"""Zigporter integration for Home Assistant — Zigbee network map."""

import json
import logging
import time
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .websocket_api import async_register_websocket_commands

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Zigporter integration (once per HA instance)."""
    static_dir = Path(__file__).parent / "static"
    card_url = "/zigporter/zigporter-network-map-card.js"
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                url_path=card_url,
                path=str(static_dir / "zigporter-network-map-card.js"),
                cache_headers=False,
            )
        ]
    )
    add_extra_js_url(hass, card_url)
    async_register_websocket_commands(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Zigporter from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    cache_path = Path(hass.config.path("zigporter")) / "network_map_cache.json"
    cache = None
    cache_time = None

    if await hass.async_add_executor_job(cache_path.exists):
        try:
            raw = await hass.async_add_executor_job(cache_path.read_text)
            cache = json.loads(raw)
            cache_time = time.monotonic()
            _LOGGER.debug("Loaded cached network map from %s", cache_path)
        except (json.JSONDecodeError, OSError) as exc:
            _LOGGER.warning("Failed to load cached network map: %s", exc)

    hass.data[DOMAIN][entry.entry_id] = {
        "cache": cache,
        "cache_time": cache_time,
        "cache_path": str(cache_path),
    }
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a Zigporter config entry."""
    hass.data[DOMAIN].pop(entry.entry_id, None)
    return True
