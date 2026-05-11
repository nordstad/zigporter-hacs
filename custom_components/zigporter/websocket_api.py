"""WebSocket API for Zigporter — serves the network map SVG."""

import asyncio
import time
from typing import Any

import voluptuous as vol
from homeassistant.components import mqtt, websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import (
    BACKEND_AUTO,
    BACKEND_Z2M,
    BACKEND_ZHA,
    CONF_BACKEND,
    CONF_CACHE_TTL,
    CONF_CRITICAL_LQI,
    CONF_MQTT_TOPIC,
    CONF_WARN_LQI,
    DEFAULT_CACHE_TTL,
    DEFAULT_CRITICAL_LQI,
    DEFAULT_MQTT_TOPIC,
    DEFAULT_WARN_LQI,
    DOMAIN,
)
from .network_map import (
    build_flat_zha_topology,
    build_routing_tree,
    build_zha_topology_from_devices,
)
from .network_map_svg import render_svg

SCAN_TIMEOUT = 30


@callback
def async_register_websocket_commands(hass: HomeAssistant) -> None:
    """Register WebSocket commands."""
    websocket_api.async_register_command(hass, ws_network_map)


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

    if not force_refresh and cache_data.get("cache") is not None:
        cache_age = time.monotonic() - (cache_data.get("cache_time") or 0)
        if cache_age < cache_ttl:
            connection.send_result(msg["id"], cache_data["cache"])
            return

    backend = entry.data.get(CONF_BACKEND, BACKEND_AUTO)
    resolved = _resolve_backend(hass, backend)

    if resolved is None:
        connection.send_error(msg["id"], "no_backend", "No Zigbee backend (Z2M or ZHA) found")
        return

    start = time.monotonic()

    try:
        if resolved == BACKEND_Z2M:
            topology = await _fetch_z2m_topology(hass, entry)
        else:
            topology = await _fetch_zha_topology(hass)
    except TimeoutError:
        connection.send_error(msg["id"], "timeout", "Network scan timed out")
        return
    except Exception as exc:  # noqa: BLE001
        connection.send_error(msg["id"], "scan_failed", str(exc))
        return

    if topology is None:
        connection.send_error(msg["id"], "no_data", "No topology data returned")
        return

    nodes, links = topology
    parent_map, lqi_map, depth_map = build_routing_tree(nodes, links)

    warn_lqi = entry.options.get(CONF_WARN_LQI, DEFAULT_WARN_LQI)
    critical_lqi = entry.options.get(CONF_CRITICAL_LQI, DEFAULT_CRITICAL_LQI)

    svg = render_svg(
        nodes=nodes,
        parent_map=parent_map,
        lqi_map=lqi_map,
        depth_map=depth_map,
        warn_lqi=warn_lqi,
        critical_lqi=critical_lqi,
    )

    scan_duration_ms = int((time.monotonic() - start) * 1000)
    max_depth = max(depth_map.values()) if depth_map else 0
    device_count = len(nodes)

    result = {
        "svg": svg,
        "device_count": device_count,
        "max_depth": max_depth,
        "scan_duration_ms": scan_duration_ms,
    }

    hass.data[DOMAIN][entry.entry_id]["cache"] = result
    hass.data[DOMAIN][entry.entry_id]["cache_time"] = time.monotonic()

    connection.send_result(msg["id"], result)


def _get_config_entry(hass: HomeAssistant):
    """Get the first Zigporter config entry."""
    entries = hass.config_entries.async_entries(DOMAIN)
    return entries[0] if entries else None


def _resolve_backend(hass: HomeAssistant, backend: str) -> str | None:
    """Resolve which backend to use."""
    if backend == BACKEND_Z2M:
        return BACKEND_Z2M
    if backend == BACKEND_ZHA:
        return BACKEND_ZHA

    has_z2m = bool(hass.config_entries.async_entries("mqtt"))
    has_zha = bool(hass.config_entries.async_entries("zha"))

    if has_z2m:
        return BACKEND_Z2M
    if has_zha:
        return BACKEND_ZHA
    return None


async def _fetch_z2m_topology(
    hass: HomeAssistant, entry: Any
) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]] | None:
    """Fetch topology from Zigbee2MQTT via MQTT."""
    topic_prefix = entry.data.get(CONF_MQTT_TOPIC, DEFAULT_MQTT_TOPIC)
    response_topic = f"{topic_prefix}/bridge/response/networkmap"
    request_topic = f"{topic_prefix}/bridge/request/networkmap"

    future: asyncio.Future[dict[str, Any]] = hass.loop.create_future()

    def on_message(msg) -> None:
        if not future.done():
            import json  # noqa: PLC0415

            try:
                payload = json.loads(msg.payload)
            except (json.JSONDecodeError, TypeError):
                return
            future.set_result(payload)

    unsub = await mqtt.async_subscribe(hass, response_topic, on_message, qos=0)

    try:
        await mqtt.async_publish(hass, request_topic, '{"type":"raw","routes":true}', qos=0)
        response = await asyncio.wait_for(future, timeout=SCAN_TIMEOUT)
    finally:
        unsub()

    data = response.get("data", response)
    raw_nodes: list[dict[str, Any]] = data.get("nodes", [])
    links: list[dict[str, Any]] = data.get("links", [])

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
