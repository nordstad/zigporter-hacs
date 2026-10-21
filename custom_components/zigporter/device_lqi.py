"""Track the last link quality Zigbee2MQTT reported for each device.

Zigbee2MQTT's network map takes link LQI from router neighbor tables. Many
routers (older SONOFF/CC2530 firmware among them) report 0 for the sleepy end
devices they parent, so those devices show up with "?" and a critical ring
even when their link is healthy.

Zigbee2MQTT does know each device's link quality: it publishes `linkquality`
in every device state message on `<topic>/<friendly_name>`. This tracker keeps
the latest value per friendly name so a scan can fall back to it, the same way
the ZHA backend falls back to the device-level LQI ZHA keeps.
"""

import json
import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from homeassistant.components import mqtt
from homeassistant.core import HomeAssistant, callback

_LOGGER = logging.getLogger(__name__)

# Sub-topics Zigbee2MQTT uses for commands and status, never device state.
_IGNORED_SUFFIXES = ("/set", "/get", "/availability")

# Older values are ignored, so a dead or removed device does not keep a healthy LQI.
MAX_AGE = timedelta(hours=24)


class Z2MDeviceLqiTracker:
    """Remember the latest `linkquality` each Zigbee2MQTT device reported."""

    def __init__(self, hass: HomeAssistant, topic_prefix: str, store_path: str | None) -> None:
        self._hass = hass
        self.topic_prefix = topic_prefix.strip("/")
        self._store_path = store_path
        self._unsub: Callable[[], None] | None = None
        self._stopped = False
        # friendly_name -> {"lqi": int, "time": ISO timestamp}
        self.values: dict[str, dict[str, Any]] = {}

    async def async_load(self) -> None:
        """Load values saved before the last restart, so a scan right after
        a restart still has data for devices that have not reported yet."""
        if not self._store_path:
            return
        try:
            raw = await self._hass.async_add_executor_job(_read_text, self._store_path)
        except OSError as exc:
            _LOGGER.debug("No saved device LQI at %s: %s", self._store_path, exc)
            return
        if not raw:
            return
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError) as exc:
            _LOGGER.warning("Ignoring unreadable device LQI file %s: %s", self._store_path, exc)
            return
        if isinstance(data, dict):
            self.values = {
                name: value
                for name, value in data.items()
                if isinstance(value, dict) and _valid_lqi(value.get("lqi"))
            }

    async def async_save(self) -> None:
        """Persist the current values next to the network map cache."""
        self._prune()
        if not self._store_path or not self.values:
            return
        try:
            await self._hass.async_add_executor_job(
                _write_text, self._store_path, json.dumps(self.values)
            )
        except OSError as exc:
            _LOGGER.warning("Failed to save device LQI to %s: %s", self._store_path, exc)

    async def async_start(self) -> None:
        """Subscribe to all device topics under the prefix."""
        if self._unsub is not None or self._stopped:
            return
        if not await mqtt.async_wait_for_mqtt_client(self._hass):
            _LOGGER.warning("MQTT not available; device LQI fallback is disabled")
            return
        if self._stopped:
            return
        unsub = await mqtt.async_subscribe(
            self._hass, f"{self.topic_prefix}/#", self._on_message, qos=0
        )
        if self._stopped:
            unsub()
            return
        self._unsub = unsub
        _LOGGER.debug("Tracking device LQI on %s/#", self.topic_prefix)

    @callback
    def async_stop(self) -> None:
        """Unsubscribe, and stop a pending start from subscribing later."""
        self._stopped = True
        if self._unsub is not None:
            self._unsub()
            self._unsub = None

    @callback
    def _on_message(self, msg: Any) -> None:
        name = self._friendly_name(msg.topic)
        if name is None:
            return
        payload = msg.payload
        if isinstance(payload, bytes | bytearray):
            try:
                payload = payload.decode()
            except UnicodeDecodeError:
                return
        if not isinstance(payload, str) or '"linkquality"' not in payload:
            return
        try:
            data = json.loads(payload)
        except (json.JSONDecodeError, TypeError):
            return
        if not isinstance(data, dict):
            return
        lqi = data.get("linkquality")
        if not _valid_lqi(lqi):
            return
        self.values[name] = {"lqi": int(lqi), "time": datetime.now(UTC).isoformat()}

    def _friendly_name(self, topic: str) -> str | None:
        prefix = f"{self.topic_prefix}/"
        if not topic.startswith(prefix):
            return None
        name = topic[len(prefix) :]
        if not name or name == "bridge" or name.startswith("bridge/"):
            return None
        if name.endswith(_IGNORED_SUFFIXES):
            return None
        return name

    def lqi_by_name(self) -> dict[str, int]:
        """Return friendly_name -> last reported LQI, ignoring values older than MAX_AGE."""
        now = datetime.now(UTC)
        return {
            name: value["lqi"]
            for name, value in self.values.items()
            if _is_fresh(value.get("time"), now)
        }

    def _prune(self) -> None:
        now = datetime.now(UTC)
        self.values = {
            name: value for name, value in self.values.items() if _is_fresh(value.get("time"), now)
        }


def _is_fresh(raw_time: Any, now: datetime) -> bool:
    if not isinstance(raw_time, str):
        return False
    try:
        stamp = datetime.fromisoformat(raw_time)
    except ValueError:
        return False
    if stamp.tzinfo is None:
        return False
    return now - stamp <= MAX_AGE


def _valid_lqi(value: Any) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool) and 0 < value <= 255


def _read_text(path: str) -> str:
    p = Path(path)
    return p.read_text() if p.exists() else ""


def _write_text(path: str, text: str) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)
