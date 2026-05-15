"""WebSocket API for Zigporter — serves the network map SVG."""

import asyncio
import json
import logging
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import voluptuous as vol
from homeassistant.components import mqtt, websocket_api
from homeassistant.core import HomeAssistant, callback

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
from .network_map import (
    build_flat_zha_topology,
    build_routing_tree,
    build_zha_topology_from_devices,
)
from .network_map_svg import render_svg

_LOGGER = logging.getLogger(__name__)


@callback
def async_register_websocket_commands(hass: HomeAssistant) -> None:
    """Register WebSocket commands."""
    websocket_api.async_register_command(hass, ws_network_map)
    websocket_api.async_register_command(hass, ws_scan_status)


@websocket_api.websocket_command({vol.Required("type"): "zigporter/scan_status"})
@websocket_api.async_response
async def ws_scan_status(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return whether a scan is currently in progress."""
    entry = _get_config_entry(hass)
    if entry is None:
        connection.send_result(msg["id"], {"scanning": False})
        return

    cache_data = hass.data[DOMAIN].get(entry.entry_id, {})
    scan_task: asyncio.Task | None = cache_data.get("scan_task")
    scanning = scan_task is not None and not scan_task.done()
    result: dict[str, Any] = {"scanning": scanning}
    if scanning:
        result["scan_start_utc"] = cache_data.get("scan_start_utc")
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "zigporter/network_map",
        vol.Optional("force_refresh", default=False): bool,
    }
)
@websocket_api.async_response
async def ws_network_map(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle a network map request."""
    entry = _get_config_entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_configured", "Zigporter is not configured")
        return

    force_refresh = msg["force_refresh"]
    cache_data = hass.data[DOMAIN].get(entry.entry_id, {})
    cache_ttl = entry.options.get(CONF_CACHE_TTL, DEFAULT_CACHE_TTL)

    # Join an in-flight scan if one is running (regardless of force_refresh)
    scan_task: asyncio.Task | None = cache_data.get("scan_task")
    if scan_task is not None and not scan_task.done():
        try:
            result = await asyncio.shield(scan_task)
            connection.send_result(msg["id"], result)
        except asyncio.CancelledError:
            return
        except Exception as exc:  # noqa: BLE001
            connection.send_error(msg["id"], "scan_failed", str(exc))
        return

    if not force_refresh and cache_data.get("cache") is not None:
        if cache_ttl <= 0:
            connection.send_result(msg["id"], cache_data["cache"])
            return
        cache_age = time.monotonic() - (cache_data.get("cache_time") or 0)
        if cache_age < cache_ttl:
            connection.send_result(msg["id"], cache_data["cache"])
            return

    backend = entry.options.get(CONF_BACKEND, entry.data.get(CONF_BACKEND))
    resolved = _resolve_backend(backend)

    if resolved is None:
        connection.send_error(msg["id"], "no_backend", "No Zigbee backend configured")
        return

    # Run scan as a detached task so it survives WebSocket disconnection
    task = hass.async_create_task(_run_scan(hass, entry, resolved))
    hass.data[DOMAIN][entry.entry_id]["scan_task"] = task

    try:
        result = await asyncio.shield(task)
    except asyncio.CancelledError:
        return
    except Exception as exc:  # noqa: BLE001
        connection.send_error(msg["id"], "scan_failed", str(exc))
        return

    connection.send_result(msg["id"], result)


async def _run_scan(hass: HomeAssistant, entry: Any, backend: str) -> dict[str, Any]:
    """Execute a network scan, render SVG, cache and return the result."""
    hass.data[DOMAIN][entry.entry_id]["scan_start_utc"] = datetime.now(UTC).isoformat()
    start = time.monotonic()
    scan_timeout = entry.options.get(CONF_SCAN_TIMEOUT, DEFAULT_SCAN_TIMEOUT)

    if backend == BACKEND_Z2M:
        topology = await _fetch_z2m_topology(hass, entry, scan_timeout)
    else:
        topology = await asyncio.wait_for(_fetch_zha_topology(hass), timeout=scan_timeout)

    if topology is None:
        raise RuntimeError("No topology data returned")

    nodes, links = topology
    parent_map, lqi_map, depth_map = build_routing_tree(nodes, links)

    warn_lqi = entry.options.get(CONF_WARN_LQI, DEFAULT_WARN_LQI)
    critical_lqi = entry.options.get(CONF_CRITICAL_LQI, DEFAULT_CRITICAL_LQI)

    raw_colors = [
        entry.options.get(CONF_HOP_COLOR_1, ""),
        entry.options.get(CONF_HOP_COLOR_2, ""),
        entry.options.get(CONF_HOP_COLOR_3, ""),
        entry.options.get(CONF_HOP_COLOR_4, ""),
    ]
    hop_colors = raw_colors if all(raw_colors) else None
    hop_opacity = entry.options.get(CONF_HOP_OPACITY, DEFAULT_HOP_OPACITY)

    svg = render_svg(
        nodes=nodes,
        parent_map=parent_map,
        lqi_map=lqi_map,
        depth_map=depth_map,
        warn_lqi=warn_lqi,
        critical_lqi=critical_lqi,
        hop_colors=hop_colors,
        hop_opacity=hop_opacity,
    )

    scan_duration_ms = int((time.monotonic() - start) * 1000)
    max_depth = max(depth_map.values()) if depth_map else 0
    device_count = len(nodes)

    result = {
        "svg": svg,
        "device_count": device_count,
        "max_depth": max_depth,
        "scan_duration_ms": scan_duration_ms,
        "backend": backend,
        "scan_timestamp": datetime.now(UTC).isoformat(),
    }

    hass.data[DOMAIN][entry.entry_id]["cache"] = result
    hass.data[DOMAIN][entry.entry_id]["cache_time"] = time.monotonic()

    cache_path = hass.data[DOMAIN][entry.entry_id].get("cache_path")
    if cache_path:
        try:
            await hass.async_add_executor_job(_save_cache, cache_path, result)
        except OSError:
            _LOGGER.warning("Failed to save network map cache to %s", cache_path)

    return result


def _save_cache(path: str, data: dict) -> None:
    """Write cache data to disk."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data))


def _get_config_entry(hass: HomeAssistant):
    """Get the first Zigporter config entry."""
    entries = hass.config_entries.async_entries(DOMAIN)
    return entries[0] if entries else None


def _resolve_backend(backend: str | None) -> str | None:
    """Resolve which backend to use."""
    if backend in (BACKEND_Z2M, BACKEND_ZHA):
        return backend
    return None


async def _fetch_z2m_topology(
    hass: HomeAssistant, entry: Any, timeout: int = DEFAULT_SCAN_TIMEOUT
) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]] | None:
    """Fetch topology from Zigbee2MQTT via MQTT."""
    topic_prefix = entry.options.get(
        CONF_MQTT_TOPIC, entry.data.get(CONF_MQTT_TOPIC, DEFAULT_MQTT_TOPIC)
    )
    response_topic = f"{topic_prefix}/bridge/response/networkmap"
    request_topic = f"{topic_prefix}/bridge/request/networkmap"

    future: asyncio.Future[dict[str, Any]] = hass.loop.create_future()

    @callback
    def on_message(msg) -> None:
        if future.done():
            return
        try:
            payload = json.loads(msg.payload)
            future.set_result(payload)
        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            _LOGGER.error("Failed to parse Z2M networkmap response: %s", exc)

    unsub = await mqtt.async_subscribe(hass, response_topic, on_message, qos=0)

    try:
        await mqtt.async_publish(hass, request_topic, '{"type":"raw","routes":true}', qos=0)
        _LOGGER.debug("Published networkmap request to %s", request_topic)
        response = await asyncio.wait_for(future, timeout=timeout)
    finally:
        unsub()

    data = response.get("data", response)
    value = data.get("value", data)
    raw_nodes: list[dict[str, Any]] = value.get("nodes", [])
    links: list[dict[str, Any]] = value.get("links", [])

    nodes: dict[str, dict[str, Any]] = {}
    for n in raw_nodes:
        ieee = n.get("ieeeAddr", "").lower()
        if ieee:
            nodes[ieee] = n

    return nodes, links


async def _fetch_zha_topology(
    hass: HomeAssistant,
) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]] | None:
    """Fetch topology from ZHA via its internal gateway proxy."""
    try:
        from homeassistant.components.zha.helpers import (  # noqa: PLC0415
            get_zha_gateway_proxy,
        )

        gateway_proxy = get_zha_gateway_proxy(hass)
        zha_devices: list[dict[str, Any]] = [
            device.zha_device_info for device in gateway_proxy.device_proxies.values()
        ]
    except (ImportError, ValueError, AttributeError, Exception):  # noqa: BLE001
        return None

    if not zha_devices:
        return None

    has_neighbors = any(dev.get("neighbors") for dev in zha_devices)
    if has_neighbors:
        return build_zha_topology_from_devices(zha_devices)
    return build_flat_zha_topology(zha_devices)
