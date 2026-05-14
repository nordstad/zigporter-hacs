"""Constants for the Zigporter integration."""

DOMAIN = "zigporter"

CONF_BACKEND = "backend"
CONF_MQTT_TOPIC = "mqtt_topic"
CONF_WARN_LQI = "warn_lqi"
CONF_CRITICAL_LQI = "critical_lqi"
CONF_CACHE_TTL = "cache_ttl"
CONF_SCAN_TIMEOUT = "scan_timeout"

DEFAULT_MQTT_TOPIC = "zigbee2mqtt"
DEFAULT_WARN_LQI = 50
DEFAULT_CRITICAL_LQI = 20
DEFAULT_CACHE_TTL = 0  # 0 = manual refresh only (never auto-expire)
DEFAULT_SCAN_TIMEOUT = 180

BACKEND_Z2M = "zigbee2mqtt"
BACKEND_ZHA = "zha"
BACKEND_AUTO = "auto"
