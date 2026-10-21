"""Zigporter integration for Home Assistant — Zigbee network map."""

import json
import logging
import shutil
import time
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv

from .const import BACKEND_Z2M, CONF_BACKEND, DOMAIN, _resolve_backend
from .device_lqi import Z2MDeviceLqiTracker
from .websocket_api import _get_mqtt_topic, async_register_websocket_commands

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


def _cache_path(hass: HomeAssistant, entry: ConfigEntry) -> Path:
    """Return the cache file for an entry.

    The original single entry (unique id == DOMAIN) keeps the legacy location so
    existing caches and history survive; every other entry gets its own folder.
    """
    base = Path(hass.config.path("zigporter"))
    if entry.unique_id == DOMAIN:
        return base / "network_map_cache.json"
    return base / entry.entry_id / "network_map_cache.json"


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Zigporter from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    cache_path = _cache_path(hass, entry)
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

    await _async_start_lqi_tracker(hass, entry)
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    return True


def _is_z2m(entry: ConfigEntry) -> bool:
    backend = entry.options.get(CONF_BACKEND, entry.data.get(CONF_BACKEND))
    return _resolve_backend(backend) == BACKEND_Z2M


async def _async_start_lqi_tracker(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Start tracking reported device LQI for a Zigbee2MQTT entry.

    Values are saved next to the network map cache so they survive restarts.
    """
    entry_data = hass.data[DOMAIN][entry.entry_id]
    if not _is_z2m(entry):
        return
    store_path = str(Path(entry_data["cache_path"]).with_name("device_lqi.json"))
    tracker = Z2MDeviceLqiTracker(hass, _get_mqtt_topic(entry), store_path)
    await tracker.async_load()
    entry_data["lqi_tracker"] = tracker
    entry.async_create_background_task(hass, tracker.async_start(), "zigporter_device_lqi")


def _async_stop_lqi_tracker(hass: HomeAssistant, entry: ConfigEntry) -> None:
    entry_data = hass.data.get(DOMAIN, {}).get(entry.entry_id, {})
    tracker = entry_data.pop("lqi_tracker", None)
    if tracker is not None:
        tracker.async_stop()


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Invalidate cached SVG when options change (e.g. colors)."""
    if entry.entry_id in hass.data.get(DOMAIN, {}):
        hass.data[DOMAIN][entry.entry_id]["cache"] = None
        hass.data[DOMAIN][entry.entry_id]["cache_time"] = None
        # Backend or topic may have changed: follow it.
        tracker = hass.data[DOMAIN][entry.entry_id].get("lqi_tracker")
        new_topic = _get_mqtt_topic(entry).strip("/") if _is_z2m(entry) else None
        if tracker is None or tracker.topic_prefix != new_topic:
            _async_stop_lqi_tracker(hass, entry)
            await _async_start_lqi_tracker(hass, entry)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a Zigporter config entry."""
    _async_stop_lqi_tracker(hass, entry)
    hass.data[DOMAIN].pop(entry.entry_id, None)
    return True


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Delete the stored cache and history of a removed entry."""
    if entry.unique_id == DOMAIN:
        return
    entry_dir = Path(hass.config.path("zigporter")) / entry.entry_id
    await hass.async_add_executor_job(shutil.rmtree, entry_dir, True)
