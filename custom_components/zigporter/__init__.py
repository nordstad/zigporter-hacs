"""Zigporter integration for Home Assistant — Zigbee network map."""

import json
import logging
import time
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN
from .websocket_api import async_register_websocket_commands

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Zigporter integration (once per HA instance)."""
    static_dir = Path(__file__).parent / "static"
    card_path = "/zigporter/zigporter-network-map-card.js"
    js_file = static_dir / "zigporter-network-map-card.js"

    if not js_file.is_file():
        _LOGGER.error("Card JS file not found at %s", js_file)

    manifest_path = Path(__file__).parent / "manifest.json"
    raw = await hass.async_add_executor_job(manifest_path.read_text)
    version = json.loads(raw).get("version", "0")

    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                url_path=card_path,
                path=str(js_file),
                cache_headers=False,
            )
        ]
    )
    add_extra_js_url(hass, f"{card_path}?v={version}")
    async_register_websocket_commands(hass)
    _LOGGER.info("Registered card resource at %s", card_path)
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

    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    return True


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Invalidate cached SVG when options change (e.g. colors)."""
    if entry.entry_id in hass.data.get(DOMAIN, {}):
        hass.data[DOMAIN][entry.entry_id]["cache"] = None
        hass.data[DOMAIN][entry.entry_id]["cache_time"] = None


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a Zigporter config entry."""
    hass.data[DOMAIN].pop(entry.entry_id, None)
    return True
