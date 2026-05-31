"""Tests for __init__.py — integration setup, config entry, and cache loading."""

import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from custom_components.zigporter import (
    _async_options_updated,
    async_setup,
    async_setup_entry,
    async_unload_entry,
)
from custom_components.zigporter.const import DOMAIN


@pytest.fixture
def mock_hass():
    hass = MagicMock()
    hass.http = MagicMock()
    hass.http.async_register_static_paths = AsyncMock()
    hass.data = {}
    hass.config = MagicMock()
    hass.config.path = MagicMock(side_effect=lambda subdir: f"/config/{subdir}")
    hass.async_add_executor_job = AsyncMock()
    return hass


@pytest.fixture
def mock_entry():
    entry = MagicMock()
    entry.entry_id = "test_entry_123"
    entry.options = {}
    entry.data = {}
    entry.async_on_unload = MagicMock()
    entry.add_update_listener = MagicMock(return_value=lambda: None)
    return entry


class TestAsyncSetup:
    async def test_registers_static_path_and_js_url(self, mock_hass):
        mock_hass.async_add_executor_job = AsyncMock(return_value='{"version": "1.0.0"}')
        with (
            patch("custom_components.zigporter.add_extra_js_url") as mock_add_js,
            patch("custom_components.zigporter.async_register_websocket_commands") as mock_ws,
        ):
            result = await async_setup(mock_hass, {})

        assert result is True
        mock_hass.http.async_register_static_paths.assert_called_once()
        mock_add_js.assert_called_once()
        mock_ws.assert_called_once_with(mock_hass)

    async def test_logs_error_when_js_file_missing(self, mock_hass):
        mock_hass.async_add_executor_job = AsyncMock(return_value='{"version": "1.0.0"}')
        with (
            patch("custom_components.zigporter.add_extra_js_url"),
            patch("custom_components.zigporter.async_register_websocket_commands"),
            patch("pathlib.Path.is_file", return_value=False),
            patch("custom_components.zigporter._LOGGER") as mock_logger,
        ):
            result = await async_setup(mock_hass, {})

        assert result is True
        mock_logger.error.assert_called_once()


class TestAsyncSetupEntry:
    async def test_loads_cache_from_disk(self, mock_hass, mock_entry):
        mock_hass.data.setdefault(DOMAIN, {})
        cache_data = {"svg": "<svg/>", "device_count": 5}

        mock_hass.async_add_executor_job = AsyncMock(side_effect=[True, json.dumps(cache_data)])

        result = await async_setup_entry(mock_hass, mock_entry)

        assert result is True
        entry_data = mock_hass.data[DOMAIN][mock_entry.entry_id]
        assert entry_data["cache"] == cache_data
        assert entry_data["cache_time"] is not None

    async def test_handles_missing_cache_file(self, mock_hass, mock_entry):
        mock_hass.data.setdefault(DOMAIN, {})
        mock_hass.async_add_executor_job = AsyncMock(return_value=False)

        result = await async_setup_entry(mock_hass, mock_entry)

        assert result is True
        entry_data = mock_hass.data[DOMAIN][mock_entry.entry_id]
        assert entry_data["cache"] is None
        assert entry_data["cache_time"] is None

    async def test_handles_corrupt_cache_file(self, mock_hass, mock_entry):
        mock_hass.data.setdefault(DOMAIN, {})
        mock_hass.async_add_executor_job = AsyncMock(side_effect=[True, "not valid json{{{"])

        result = await async_setup_entry(mock_hass, mock_entry)

        assert result is True
        entry_data = mock_hass.data[DOMAIN][mock_entry.entry_id]
        assert entry_data["cache"] is None

    async def test_registers_update_listener(self, mock_hass, mock_entry):
        mock_hass.data.setdefault(DOMAIN, {})
        mock_hass.async_add_executor_job = AsyncMock(return_value=False)

        await async_setup_entry(mock_hass, mock_entry)

        mock_entry.async_on_unload.assert_called_once()


class TestAsyncOptionsUpdated:
    async def test_invalidates_cache(self, mock_hass, mock_entry):
        mock_hass.data = {
            DOMAIN: {
                mock_entry.entry_id: {
                    "cache": {"svg": "<svg/>"},
                    "cache_time": time.monotonic(),
                }
            }
        }

        await _async_options_updated(mock_hass, mock_entry)

        assert mock_hass.data[DOMAIN][mock_entry.entry_id]["cache"] is None
        assert mock_hass.data[DOMAIN][mock_entry.entry_id]["cache_time"] is None

    async def test_no_op_if_entry_not_in_data(self, mock_hass, mock_entry):
        mock_hass.data = {DOMAIN: {}}
        await _async_options_updated(mock_hass, mock_entry)


class TestAsyncUnloadEntry:
    async def test_removes_entry_data(self, mock_hass, mock_entry):
        mock_hass.data = {DOMAIN: {mock_entry.entry_id: {"cache": None}}}

        result = await async_unload_entry(mock_hass, mock_entry)

        assert result is True
        assert mock_entry.entry_id not in mock_hass.data[DOMAIN]

    async def test_no_error_if_entry_not_present(self, mock_hass, mock_entry):
        mock_hass.data = {DOMAIN: {}}

        result = await async_unload_entry(mock_hass, mock_entry)

        assert result is True
