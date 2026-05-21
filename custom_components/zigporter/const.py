"""Constants for the Zigporter integration."""

DOMAIN = "zigporter"

CONF_BACKEND = "backend"
CONF_MQTT_TOPIC = "mqtt_topic"
CONF_WARN_LQI = "warn_lqi"
CONF_CRITICAL_LQI = "critical_lqi"
CONF_CACHE_TTL = "cache_ttl"
CONF_SCAN_TIMEOUT = "scan_timeout"
CONF_HOP_COLOR_1 = "hop_color_1"
CONF_HOP_COLOR_2 = "hop_color_2"
CONF_HOP_COLOR_3 = "hop_color_3"
CONF_HOP_COLOR_4 = "hop_color_4"
CONF_HOP_OPACITY = "hop_opacity"

DEFAULT_MQTT_TOPIC = "zigbee2mqtt"
DEFAULT_WARN_LQI = 50
DEFAULT_CRITICAL_LQI = 20
DEFAULT_CACHE_TTL = 0  # 0 = manual refresh only (never auto-expire)
DEFAULT_SCAN_TIMEOUT = 1000
DEFAULT_HOP_COLORS = ["#101819", "#1C2829", "#2B3A3A", "#425352"]
DEFAULT_HOP_OPACITY = 0.90

BACKEND_Z2M = "zigbee2mqtt"
BACKEND_ZHA = "zha"


def _resolve_backend(backend: str | None) -> str | None:
    """Resolve which backend to use."""
    if backend in (BACKEND_Z2M, BACKEND_ZHA):
        return backend
    return None
