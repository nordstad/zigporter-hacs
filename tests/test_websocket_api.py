"""Tests for websocket_api.py — WebSocket handlers, scan orchestration, cache."""

import asyncio
import json
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from custom_components.zigporter.const import (
    BACKEND_Z2M,
    BACKEND_ZHA,
    CONF_BACKEND,
    CONF_CACHE_TTL,
    CONF_HOP_COLOR_1,
    CONF_HOP_COLOR_2,
    CONF_HOP_COLOR_3,
    CONF_HOP_COLOR_4,
    CONF_HOP_OPACITY,
    CONF_MQTT_TOPIC,
    CONF_SCAN_TIMEOUT,
    DOMAIN,
)
from custom_components.zigporter.websocket_api import (
    _fetch_z2m_topology,
    _fetch_zha_topology,
    _get_config_entry,
    _history_dir,
    _list_history,
    _read_history_snapshot,
    _run_scan,
    _save_cache,
    _save_history_snapshot,
    async_register_websocket_commands,
    ws_history_get,
    ws_history_list,
    ws_network_map,
    ws_scan_status,
)


@pytest.fixture
async def mock_hass():
    hass = MagicMock()
    hass.data = {DOMAIN: {}}
    hass.config_entries = MagicMock()
    hass.loop = asyncio.get_event_loop()
    hass.async_create_task = MagicMock(side_effect=lambda coro: asyncio.ensure_future(coro))
    hass.async_add_executor_job = AsyncMock()
    return hass


@pytest.fixture
def mock_entry():
    entry = MagicMock()
    entry.entry_id = "test_entry"
    entry.data = {CONF_BACKEND: BACKEND_Z2M, CONF_MQTT_TOPIC: "zigbee2mqtt"}
    entry.options = {}
    return entry


@pytest.fixture
def mock_connection():
    conn = MagicMock()
    conn.send_result = MagicMock()
    conn.send_error = MagicMock()
    return conn


class TestAsyncRegisterWebsocketCommands:
    def test_registers_all_commands(self, mock_hass):
        with patch("custom_components.zigporter.websocket_api.websocket_api") as mock_ws_api:
            async_register_websocket_commands(mock_hass)
            assert mock_ws_api.async_register_command.call_count == 4


class TestGetConfigEntry:
    def test_returns_first_entry(self, mock_hass):
        entry = MagicMock()
        mock_hass.config_entries.async_entries = MagicMock(return_value=[entry])
        assert _get_config_entry(mock_hass) is entry

    def test_returns_none_when_no_entries(self, mock_hass):
        mock_hass.config_entries.async_entries = MagicMock(return_value=[])
        assert _get_config_entry(mock_hass) is None


class TestWsScanStatus:
    async def test_returns_not_scanning_when_no_entry(self, mock_hass, mock_connection):
        mock_hass.config_entries.async_entries = MagicMock(return_value=[])
        msg = {"id": 1, "type": "zigporter/scan_status"}

        await ws_scan_status(mock_hass, mock_connection, msg)

        mock_connection.send_result.assert_called_once_with(1, {"scanning": False})

    async def test_returns_not_scanning_when_no_task(self, mock_hass, mock_entry, mock_connection):
        mock_hass.config_entries.async_entries = MagicMock(return_value=[mock_entry])
        mock_hass.data[DOMAIN][mock_entry.entry_id] = {}
        msg = {"id": 1, "type": "zigporter/scan_status"}

        await ws_scan_status(mock_hass, mock_connection, msg)

        mock_connection.send_result.assert_called_once_with(1, {"scanning": False})

    async def test_returns_scanning_with_timestamp(self, mock_hass, mock_entry, mock_connection):
        mock_hass.config_entries.async_entries = MagicMock(return_value=[mock_entry])
        task = asyncio.ensure_future(asyncio.sleep(100))
        start_utc = "2026-01-01T12:00:00+00:00"
        mock_hass.data[DOMAIN][mock_entry.entry_id] = {
            "scan_task": task,
            "scan_start_utc": start_utc,
        }
        msg = {"id": 1, "type": "zigporter/scan_status"}

        await ws_scan_status(mock_hass, mock_connection, msg)

        result = mock_connection.send_result.call_args[0][1]
        assert result["scanning"] is True
        assert result["scan_start_utc"] == start_utc
        task.cancel()

    async def test_returns_not_scanning_when_task_done(
        self, mock_hass, mock_entry, mock_connection
    ):
        mock_hass.config_entries.async_entries = MagicMock(return_value=[mock_entry])
        task = asyncio.ensure_future(asyncio.sleep(0))
        await task
        mock_hass.data[DOMAIN][mock_entry.entry_id] = {"scan_task": task}
        msg = {"id": 1, "type": "zigporter/scan_status"}

        await ws_scan_status(mock_hass, mock_connection, msg)

        result = mock_connection.send_result.call_args[0][1]
        assert result["scanning"] is False


class TestWsNetworkMap:
    async def test_error_when_not_configured(self, mock_hass, mock_connection):
        mock_hass.config_entries.async_entries = MagicMock(return_value=[])
        msg = {"id": 1, "type": "zigporter/network_map", "force_refresh": False}

        await ws_network_map(mock_hass, mock_connection, msg)

        mock_connection.send_error.assert_called_once_with(
            1, "not_configured", "Zigporter is not configured"
        )

    async def test_serves_cache_when_available(self, mock_hass, mock_entry, mock_connection):
        mock_hass.config_entries.async_entries = MagicMock(return_value=[mock_entry])
        cached = {"svg": "<svg/>", "device_count": 5}
        mock_hass.data[DOMAIN][mock_entry.entry_id] = {
            "cache": cached,
            "cache_time": time.monotonic(),
        }
        msg = {"id": 1, "type": "zigporter/network_map", "force_refresh": False}

        await ws_network_map(mock_hass, mock_connection, msg)

        mock_connection.send_result.assert_called_once_with(1, cached)

    async def test_serves_cache_when_ttl_not_expired(self, mock_hass, mock_entry, mock_connection):
        mock_entry.options = {CONF_CACHE_TTL: 300}
        mock_hass.config_entries.async_entries = MagicMock(return_value=[mock_entry])
        cached = {"svg": "<svg/>"}
        mock_hass.data[DOMAIN][mock_entry.entry_id] = {
            "cache": cached,
            "cache_time": time.monotonic(),
        }
        msg = {"id": 1, "type": "zigporter/network_map", "force_refresh": False}

        await ws_network_map(mock_hass, mock_connection, msg)

        mock_connection.send_result.assert_called_once_with(1, cached)

    async def test_does_not_serve_expired_cache(self, mock_hass, mock_entry, mock_connection):
        mock_entry.options = {CONF_CACHE_TTL: 10, CONF_BACKEND: BACKEND_Z2M}
        mock_hass.config_entries.async_entries = MagicMock(return_value=[mock_entry])
        mock_hass.data[DOMAIN][mock_entry.entry_id] = {
            "cache": {"svg": "<svg/>"},
            "cache_time": time.monotonic() - 100,
        }
        msg = {"id": 1, "type": "zigporter/network_map", "force_refresh": False}

        scan_result = {"svg": "<svg>new</svg>", "device_count": 3}
        with patch(
            "custom_components.zigporter.websocket_api._run_scan",
            new_callable=AsyncMock,
            return_value=scan_result,
        ):
            await ws_network_map(mock_hass, mock_connection, msg)

        mock_connection.send_result.assert_called_once_with(1, scan_result)

    async def test_error_when_no_backend(self, mock_hass, mock_entry, mock_connection):
        mock_entry.options = {CONF_BACKEND: "invalid"}
        mock_entry.data = {CONF_BACKEND: "invalid"}
        mock_hass.config_entries.async_entries = MagicMock(return_value=[mock_entry])
        mock_hass.data[DOMAIN][mock_entry.entry_id] = {"cache": None, "cache_time": None}
        msg = {"id": 1, "type": "zigporter/network_map", "force_refresh": True}

        await ws_network_map(mock_hass, mock_connection, msg)

        mock_connection.send_error.assert_called_once_with(
            1, "no_backend", "No Zigbee backend configured"
        )

    async def test_joins_inflight_scan(self, mock_hass, mock_entry, mock_connection):
        mock_hass.config_entries.async_entries = MagicMock(return_value=[mock_entry])
        scan_result = {"svg": "<svg/>"}
        task = asyncio.ensure_future(asyncio.sleep(0, result=scan_result))
        mock_hass.data[DOMAIN][mock_entry.entry_id] = {
            "cache": None,
            "cache_time": None,
            "scan_task": task,
        }
        msg = {"id": 1, "type": "zigporter/network_map", "force_refresh": True}

        await ws_network_map(mock_hass, mock_connection, msg)

        mock_connection.send_result.assert_called_once_with(1, scan_result)

    async def test_scan_failure_sends_error(self, mock_hass, mock_entry, mock_connection):
        mock_entry.options = {CONF_BACKEND: BACKEND_Z2M}
        mock_hass.config_entries.async_entries = MagicMock(return_value=[mock_entry])
        mock_hass.data[DOMAIN][mock_entry.entry_id] = {"cache": None, "cache_time": None}
        msg = {"id": 1, "type": "zigporter/network_map", "force_refresh": True}

        with patch(
            "custom_components.zigporter.websocket_api._run_scan",
            new_callable=AsyncMock,
            side_effect=RuntimeError("Scan timed out"),
        ):
            await ws_network_map(mock_hass, mock_connection, msg)

        mock_connection.send_error.assert_called_once_with(1, "scan_failed", "Scan timed out")

    async def test_inflight_scan_error_sends_error(self, mock_hass, mock_entry, mock_connection):
        mock_hass.config_entries.async_entries = MagicMock(return_value=[mock_entry])

        async def failing_scan():
            raise RuntimeError("oops")

        task = asyncio.ensure_future(failing_scan())
        mock_hass.data[DOMAIN][mock_entry.entry_id] = {
            "cache": None,
            "cache_time": None,
            "scan_task": task,
        }
        msg = {"id": 1, "type": "zigporter/network_map", "force_refresh": True}

        await ws_network_map(mock_hass, mock_connection, msg)

        mock_connection.send_error.assert_called_once_with(1, "scan_failed", "oops")


class TestRunScan:
    async def test_z2m_scan_renders_svg_and_caches(self, mock_hass, mock_entry):
        mock_entry.options = {CONF_SCAN_TIMEOUT: 60}
        mock_hass.data[DOMAIN][mock_entry.entry_id] = {"cache_path": "/tmp/test_cache.json"}

        topology = (
            {
                "0x001": {"ieeeAddr": "0x001", "friendlyName": "Coord", "type": "Coordinator"},
                "0x002": {"ieeeAddr": "0x002", "friendlyName": "Router1", "type": "Router"},
            },
            [
                {"source": {"ieeeAddr": "0x002"}, "target": {"ieeeAddr": "0x001"}, "lqi": 200},
                {"source": {"ieeeAddr": "0x001"}, "target": {"ieeeAddr": "0x002"}, "lqi": 180},
            ],
        )

        with patch(
            "custom_components.zigporter.websocket_api._fetch_z2m_topology",
            new_callable=AsyncMock,
            return_value=topology,
        ):
            result = await _run_scan(mock_hass, mock_entry, BACKEND_Z2M)

        assert "svg" in result
        assert result["device_count"] == 2
        assert result["max_depth"] == 1
        assert result["backend"] == BACKEND_Z2M
        assert "scan_timestamp" in result
        assert mock_hass.data[DOMAIN][mock_entry.entry_id]["cache"] == result

    async def test_zha_scan(self, mock_hass, mock_entry):
        mock_entry.options = {CONF_SCAN_TIMEOUT: 60}
        mock_hass.data[DOMAIN][mock_entry.entry_id] = {"cache_path": None}

        topology = (
            {
                "0x001": {"ieeeAddr": "0x001", "friendlyName": "Coord", "type": "Coordinator"},
                "0x002": {"ieeeAddr": "0x002", "friendlyName": "Router1", "type": "Router"},
            },
            [
                {"source": {"ieeeAddr": "0x002"}, "target": {"ieeeAddr": "0x001"}, "lqi": 200},
            ],
        )

        with patch(
            "custom_components.zigporter.websocket_api._fetch_zha_topology",
            new_callable=AsyncMock,
            return_value=topology,
        ):
            result = await _run_scan(mock_hass, mock_entry, BACKEND_ZHA)

        assert result["device_count"] == 2
        assert result["backend"] == BACKEND_ZHA

    async def test_timeout_raises_runtime_error(self, mock_hass, mock_entry):
        mock_entry.options = {CONF_SCAN_TIMEOUT: 1}
        mock_hass.data[DOMAIN][mock_entry.entry_id] = {"cache_path": None}

        with (
            patch(
                "custom_components.zigporter.websocket_api._fetch_z2m_topology",
                new_callable=AsyncMock,
                side_effect=TimeoutError(),
            ),
            pytest.raises(RuntimeError, match="Scan timed out"),
        ):
            await _run_scan(mock_hass, mock_entry, BACKEND_Z2M)

    async def test_no_topology_raises(self, mock_hass, mock_entry):
        mock_entry.options = {CONF_SCAN_TIMEOUT: 60}
        mock_hass.data[DOMAIN][mock_entry.entry_id] = {"cache_path": None}

        with (
            patch(
                "custom_components.zigporter.websocket_api._fetch_z2m_topology",
                new_callable=AsyncMock,
                return_value=None,
            ),
            pytest.raises(RuntimeError, match="No topology data"),
        ):
            await _run_scan(mock_hass, mock_entry, BACKEND_Z2M)

    async def test_custom_hop_colors_used(self, mock_hass, mock_entry):
        mock_entry.options = {
            CONF_SCAN_TIMEOUT: 60,
            CONF_HOP_COLOR_1: "#111111",
            CONF_HOP_COLOR_2: "#222222",
            CONF_HOP_COLOR_3: "#333333",
            CONF_HOP_COLOR_4: "#444444",
            CONF_HOP_OPACITY: 0.5,
        }
        mock_hass.data[DOMAIN][mock_entry.entry_id] = {"cache_path": None}

        topology = (
            {
                "0x001": {"ieeeAddr": "0x001", "friendlyName": "Coord", "type": "Coordinator"},
                "0x002": {"ieeeAddr": "0x002", "friendlyName": "R", "type": "Router"},
            },
            [
                {"source": {"ieeeAddr": "0x002"}, "target": {"ieeeAddr": "0x001"}, "lqi": 200},
            ],
        )

        with patch(
            "custom_components.zigporter.websocket_api._fetch_z2m_topology",
            new_callable=AsyncMock,
            return_value=topology,
        ):
            result = await _run_scan(mock_hass, mock_entry, BACKEND_Z2M)

        assert "#111111" in result["svg"]

    async def test_cache_save_failure_does_not_raise(self, mock_hass, mock_entry):
        mock_entry.options = {CONF_SCAN_TIMEOUT: 60}
        mock_hass.data[DOMAIN][mock_entry.entry_id] = {"cache_path": "/nonexistent/path.json"}
        mock_hass.async_add_executor_job = AsyncMock(side_effect=OSError("disk full"))

        topology = (
            {
                "0x001": {"ieeeAddr": "0x001", "friendlyName": "Coord", "type": "Coordinator"},
                "0x002": {"ieeeAddr": "0x002", "friendlyName": "R", "type": "Router"},
            },
            [
                {"source": {"ieeeAddr": "0x002"}, "target": {"ieeeAddr": "0x001"}, "lqi": 200},
                {"source": {"ieeeAddr": "0x001"}, "target": {"ieeeAddr": "0x002"}, "lqi": 180},
            ],
        )

        with patch(
            "custom_components.zigporter.websocket_api._fetch_z2m_topology",
            new_callable=AsyncMock,
            return_value=topology,
        ):
            result = await _run_scan(mock_hass, mock_entry, BACKEND_Z2M)

        assert result["device_count"] == 2


class TestSaveCache:
    def test_writes_json_to_disk(self, tmp_path):
        path = str(tmp_path / "subdir" / "cache.json")
        data = {"svg": "<svg/>", "count": 42}

        _save_cache(path, data)

        content = Path(path).read_text()
        assert json.loads(content) == data

    def test_creates_parent_dirs(self, tmp_path):
        path = str(tmp_path / "deep" / "nested" / "cache.json")

        _save_cache(path, {"test": True})

        assert Path(path).exists()


class TestSaveHistorySnapshot:
    def test_writes_snapshot_with_id(self, tmp_path):
        cache_path = str(tmp_path / "network_map_cache.json")

        _save_history_snapshot(cache_path, {"svg": "<svg/>", "device_count": 3})

        files = list((tmp_path / "history").glob("*.json"))
        assert len(files) == 1
        saved = json.loads(files[0].read_text())
        assert saved["device_count"] == 3
        assert saved["id"] == files[0].stem

    def test_prunes_oldest_beyond_limit(self, tmp_path):
        cache_path = str(tmp_path / "network_map_cache.json")
        history_dir = tmp_path / "history"
        history_dir.mkdir()
        for i in range(35):
            (history_dir / f"{i:03d}.json").write_text(json.dumps({"id": f"{i:03d}"}))

        _save_history_snapshot(cache_path, {"svg": "<svg/>"})

        remaining = sorted(history_dir.glob("*.json"))
        assert len(remaining) == 30
        assert remaining[0].stem == "006"


class TestListHistory:
    def test_returns_empty_when_no_dir(self, tmp_path):
        cache_path = str(tmp_path / "network_map_cache.json")
        assert _list_history(cache_path) == []

    def test_returns_metadata_newest_first(self, tmp_path):
        cache_path = str(tmp_path / "network_map_cache.json")
        history_dir = tmp_path / "history"
        history_dir.mkdir()
        (history_dir / "100.json").write_text(
            json.dumps(
                {
                    "id": "100",
                    "svg": "<svg>old</svg>",
                    "scan_timestamp": "2026-01-01T00:00:00Z",
                    "device_count": 2,
                    "max_depth": 1,
                    "backend": "zigbee2mqtt",
                    "scan_duration_ms": 100,
                }
            )
        )
        (history_dir / "200.json").write_text(
            json.dumps(
                {
                    "id": "200",
                    "svg": "<svg>new</svg>",
                    "scan_timestamp": "2026-01-02T00:00:00Z",
                    "device_count": 3,
                    "max_depth": 2,
                    "backend": "zigbee2mqtt",
                    "scan_duration_ms": 200,
                }
            )
        )

        snapshots = _list_history(cache_path)

        assert [s["id"] for s in snapshots] == ["200", "100"]
        assert "svg" not in snapshots[0]

    def test_skips_corrupt_files(self, tmp_path):
        cache_path = str(tmp_path / "network_map_cache.json")
        history_dir = tmp_path / "history"
        history_dir.mkdir()
        (history_dir / "bad.json").write_text("not json")

        assert _list_history(cache_path) == []


class TestReadHistorySnapshot:
    def test_reads_full_snapshot(self, tmp_path):
        cache_path = str(tmp_path / "network_map_cache.json")
        history_dir = tmp_path / "history"
        history_dir.mkdir()
        (history_dir / "123.json").write_text(json.dumps({"id": "123", "svg": "<svg/>"}))

        result = _read_history_snapshot(cache_path, "123")

        assert result == {"id": "123", "svg": "<svg/>"}

    def test_returns_none_when_missing(self, tmp_path):
        cache_path = str(tmp_path / "network_map_cache.json")
        assert _read_history_snapshot(cache_path, "999") is None

    def test_rejects_non_numeric_id(self, tmp_path):
        cache_path = str(tmp_path / "network_map_cache.json")
        history_dir = _history_dir(cache_path)
        history_dir.mkdir(parents=True)
        (history_dir / "..%2Fsecret.json").write_text("{}")

        assert _read_history_snapshot(cache_path, "../secret") is None

    def test_returns_none_on_corrupt_file(self, tmp_path):
        cache_path = str(tmp_path / "network_map_cache.json")
        history_dir = _history_dir(cache_path)
        history_dir.mkdir(parents=True)
        (history_dir / "456.json").write_text("not json")

        assert _read_history_snapshot(cache_path, "456") is None


class TestWsHistoryList:
    async def test_returns_empty_when_no_entry(self, mock_hass, mock_connection):
        mock_hass.config_entries.async_entries = MagicMock(return_value=[])
        msg = {"id": 1, "type": "zigporter/history_list"}

        await ws_history_list(mock_hass, mock_connection, msg)

        mock_connection.send_result.assert_called_once_with(1, {"snapshots": []})

    async def test_returns_snapshots(self, mock_hass, mock_entry, mock_connection):
        mock_hass.config_entries.async_entries = MagicMock(return_value=[mock_entry])
        mock_hass.data[DOMAIN][mock_entry.entry_id] = {"cache_path": "/tmp/x/cache.json"}
        mock_hass.async_add_executor_job = AsyncMock(return_value=[{"id": "1"}])
        msg = {"id": 1, "type": "zigporter/history_list"}

        await ws_history_list(mock_hass, mock_connection, msg)

        mock_connection.send_result.assert_called_once_with(1, {"snapshots": [{"id": "1"}]})


class TestWsHistoryGet:
    async def test_error_when_no_cache_path(self, mock_hass, mock_entry, mock_connection):
        mock_hass.config_entries.async_entries = MagicMock(return_value=[mock_entry])
        mock_hass.data[DOMAIN][mock_entry.entry_id] = {"cache_path": None}
        msg = {"id": 1, "type": "zigporter/history_get", "snapshot_id": "123"}

        await ws_history_get(mock_hass, mock_connection, msg)

        mock_connection.send_error.assert_called_once_with(1, "not_found", "Snapshot not found")

    async def test_error_when_snapshot_missing(self, mock_hass, mock_entry, mock_connection):
        mock_hass.config_entries.async_entries = MagicMock(return_value=[mock_entry])
        mock_hass.data[DOMAIN][mock_entry.entry_id] = {"cache_path": "/tmp/x/cache.json"}
        mock_hass.async_add_executor_job = AsyncMock(return_value=None)
        msg = {"id": 1, "type": "zigporter/history_get", "snapshot_id": "123"}

        await ws_history_get(mock_hass, mock_connection, msg)

        mock_connection.send_error.assert_called_once_with(1, "not_found", "Snapshot not found")

    async def test_returns_snapshot(self, mock_hass, mock_entry, mock_connection):
        mock_hass.config_entries.async_entries = MagicMock(return_value=[mock_entry])
        mock_hass.data[DOMAIN][mock_entry.entry_id] = {"cache_path": "/tmp/x/cache.json"}
        snapshot = {"id": "123", "svg": "<svg/>"}
        mock_hass.async_add_executor_job = AsyncMock(return_value=snapshot)
        msg = {"id": 1, "type": "zigporter/history_get", "snapshot_id": "123"}

        await ws_history_get(mock_hass, mock_connection, msg)

        mock_connection.send_result.assert_called_once_with(1, snapshot)


class TestFetchZ2mTopology:
    async def test_parses_z2m_response(self, mock_hass, mock_entry):
        mock_entry.options = {CONF_MQTT_TOPIC: "zigbee2mqtt"}

        z2m_payload = {
            "data": {
                "value": {
                    "nodes": [
                        {"ieeeAddr": "0x001", "friendlyName": "Coord", "type": "Coordinator"},
                        {"ieeeAddr": "0x002", "friendlyName": "R1", "type": "Router"},
                    ],
                    "links": [
                        {
                            "source": {"ieeeAddr": "0x002"},
                            "target": {"ieeeAddr": "0x001"},
                            "lqi": 200,
                        },
                    ],
                }
            }
        }

        async def mock_subscribe(hass, topic, callback, qos=0):
            msg = MagicMock()
            msg.payload = json.dumps(z2m_payload)
            callback(msg)
            return MagicMock()

        with (
            patch(
                "custom_components.zigporter.websocket_api.mqtt.async_subscribe",
                side_effect=mock_subscribe,
            ),
            patch(
                "custom_components.zigporter.websocket_api.mqtt.async_publish",
                new_callable=AsyncMock,
            ),
        ):
            nodes, links = await _fetch_z2m_topology(mock_hass, mock_entry, timeout=10)

        assert "0x001" in nodes
        assert "0x002" in nodes
        assert len(links) == 1

    async def test_skips_nodes_without_ieee(self, mock_hass, mock_entry):
        mock_entry.options = {CONF_MQTT_TOPIC: "zigbee2mqtt"}

        z2m_payload = {
            "data": {
                "value": {
                    "nodes": [
                        {"ieeeAddr": "0x001", "friendlyName": "Coord", "type": "Coordinator"},
                        {"ieeeAddr": "", "friendlyName": "Ghost", "type": "Router"},
                    ],
                    "links": [],
                }
            }
        }

        async def mock_subscribe(hass, topic, callback, qos=0):
            msg = MagicMock()
            msg.payload = json.dumps(z2m_payload)
            callback(msg)
            return MagicMock()

        with (
            patch(
                "custom_components.zigporter.websocket_api.mqtt.async_subscribe",
                side_effect=mock_subscribe,
            ),
            patch(
                "custom_components.zigporter.websocket_api.mqtt.async_publish",
                new_callable=AsyncMock,
            ),
        ):
            nodes, links = await _fetch_z2m_topology(mock_hass, mock_entry, timeout=10)

        assert len(nodes) == 1

    async def test_handles_json_parse_error(self, mock_hass, mock_entry):
        mock_entry.options = {CONF_MQTT_TOPIC: "zigbee2mqtt"}

        async def mock_subscribe(hass, topic, callback, qos=0):
            msg = MagicMock()
            msg.payload = "not json"
            callback(msg)
            return MagicMock()

        with (
            patch(
                "custom_components.zigporter.websocket_api.mqtt.async_subscribe",
                side_effect=mock_subscribe,
            ),
            patch(
                "custom_components.zigporter.websocket_api.mqtt.async_publish",
                new_callable=AsyncMock,
            ),
            pytest.raises(RuntimeError, match="Invalid JSON"),
        ):
            await _fetch_z2m_topology(mock_hass, mock_entry, timeout=10)


class TestFetchZhaTopology:
    async def test_builds_topology_with_neighbors(self, mock_hass):
        devices = [
            {
                "ieee": "00:11:22:33:44:55:66:77",
                "name": "Coord",
                "device_type": "Coordinator",
                "neighbors": [
                    {"ieee": "00:11:22:33:44:55:66:88", "lqi": "200", "relationship": "Child"},
                ],
            },
            {
                "ieee": "00:11:22:33:44:55:66:88",
                "name": "Router",
                "device_type": "Router",
                "neighbors": [
                    {"ieee": "00:11:22:33:44:55:66:77", "lqi": "180", "relationship": "Parent"},
                ],
            },
        ]

        class FakeDeviceProxy:
            def __init__(self, info):
                self.zha_device_info = info

        gateway_proxy = MagicMock()
        gateway_proxy.device_proxies = MagicMock()
        gateway_proxy.device_proxies.values = MagicMock(
            return_value=[FakeDeviceProxy(d) for d in devices]
        )

        with patch(
            "custom_components.zigporter.websocket_api.get_zha_gateway_proxy",
            return_value=gateway_proxy,
            create=True,
        ):
            import sys  # noqa: PLC0415

            zha_helpers = MagicMock()
            zha_helpers.get_zha_gateway_proxy = MagicMock(return_value=gateway_proxy)
            sys.modules["homeassistant.components.zha"] = MagicMock()
            sys.modules["homeassistant.components.zha.helpers"] = zha_helpers

            try:
                result = await _fetch_zha_topology(mock_hass)
            finally:
                del sys.modules["homeassistant.components.zha"]
                del sys.modules["homeassistant.components.zha.helpers"]

        assert result is not None
        nodes, links = result
        assert len(nodes) == 2
        assert len(links) > 0

    async def test_returns_flat_topology_without_neighbors(self, mock_hass):
        devices = [
            {
                "ieee": "00:11:22:33:44:55:66:77",
                "name": "Coord",
                "device_type": "Coordinator",
                "lqi": 255,
            },
            {
                "ieee": "00:11:22:33:44:55:66:88",
                "name": "Router",
                "device_type": "Router",
                "lqi": 180,
            },
        ]

        class FakeDeviceProxy:
            def __init__(self, info):
                self.zha_device_info = info

        gateway_proxy = MagicMock()
        gateway_proxy.device_proxies = MagicMock()
        gateway_proxy.device_proxies.values = MagicMock(
            return_value=[FakeDeviceProxy(d) for d in devices]
        )

        import sys  # noqa: PLC0415

        zha_helpers = MagicMock()
        zha_helpers.get_zha_gateway_proxy = MagicMock(return_value=gateway_proxy)
        sys.modules["homeassistant.components.zha"] = MagicMock()
        sys.modules["homeassistant.components.zha.helpers"] = zha_helpers

        try:
            result = await _fetch_zha_topology(mock_hass)
        finally:
            del sys.modules["homeassistant.components.zha"]
            del sys.modules["homeassistant.components.zha.helpers"]

        assert result is not None
        nodes, links = result
        assert len(nodes) == 2
        assert len(links) == 1

    async def test_returns_none_on_exception(self, mock_hass):
        import sys  # noqa: PLC0415

        zha_helpers = MagicMock()
        zha_helpers.get_zha_gateway_proxy = MagicMock(side_effect=RuntimeError("no ZHA"))
        sys.modules["homeassistant.components.zha"] = MagicMock()
        sys.modules["homeassistant.components.zha.helpers"] = zha_helpers

        try:
            result = await _fetch_zha_topology(mock_hass)
        finally:
            del sys.modules["homeassistant.components.zha"]
            del sys.modules["homeassistant.components.zha.helpers"]

        assert result is None

    async def test_returns_none_when_no_devices(self, mock_hass):
        gateway_proxy = MagicMock()
        gateway_proxy.device_proxies = MagicMock()
        gateway_proxy.device_proxies.values = MagicMock(return_value=[])

        import sys  # noqa: PLC0415

        zha_helpers = MagicMock()
        zha_helpers.get_zha_gateway_proxy = MagicMock(return_value=gateway_proxy)
        sys.modules["homeassistant.components.zha"] = MagicMock()
        sys.modules["homeassistant.components.zha.helpers"] = zha_helpers

        try:
            result = await _fetch_zha_topology(mock_hass)
        finally:
            del sys.modules["homeassistant.components.zha"]
            del sys.modules["homeassistant.components.zha.helpers"]

        assert result is None
