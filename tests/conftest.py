"""Shared test fixtures for Zigporter HACS tests."""

import pytest


@pytest.fixture
def sample_z2m_nodes():
    """Sample Z2M node data — coordinator + 2 routers + 1 end device."""
    return {
        "0x00124b0001abcdef": {
            "ieeeAddr": "0x00124b0001abcdef",
            "friendlyName": "Coordinator",
            "type": "Coordinator",
        },
        "0x00124b0002aaaaaa": {
            "ieeeAddr": "0x00124b0002aaaaaa",
            "friendlyName": "Living Room Router",
            "type": "Router",
        },
        "0x00124b0003bbbbbb": {
            "ieeeAddr": "0x00124b0003bbbbbb",
            "friendlyName": "Kitchen Router",
            "type": "Router",
        },
        "0x00124b0004cccccc": {
            "ieeeAddr": "0x00124b0004cccccc",
            "friendlyName": "Bedroom Sensor",
            "type": "EndDevice",
        },
    }


@pytest.fixture
def sample_z2m_links():
    """Sample Z2M link data with bidirectional LQI."""
    return [
        {
            "source": {"ieeeAddr": "0x00124b0002aaaaaa"},
            "target": {"ieeeAddr": "0x00124b0001abcdef"},
            "lqi": 180,
        },
        {
            "source": {"ieeeAddr": "0x00124b0001abcdef"},
            "target": {"ieeeAddr": "0x00124b0002aaaaaa"},
            "lqi": 165,
        },
        {
            "source": {"ieeeAddr": "0x00124b0003bbbbbb"},
            "target": {"ieeeAddr": "0x00124b0001abcdef"},
            "lqi": 120,
        },
        {
            "source": {"ieeeAddr": "0x00124b0001abcdef"},
            "target": {"ieeeAddr": "0x00124b0003bbbbbb"},
            "lqi": 95,
        },
        {
            "source": {"ieeeAddr": "0x00124b0004cccccc"},
            "target": {"ieeeAddr": "0x00124b0002aaaaaa"},
            "lqi": 140,
        },
        {
            "source": {"ieeeAddr": "0x00124b0002aaaaaa"},
            "target": {"ieeeAddr": "0x00124b0004cccccc"},
            "lqi": 130,
        },
    ]


@pytest.fixture
def sample_zha_devices():
    """Sample ZHA device list with neighbor tables."""
    return [
        {
            "ieee": "00:12:4b:00:01:ab:cd:ef",
            "name": "Coordinator",
            "device_type": "Coordinator",
            "lqi": 255,
            "neighbors": [
                {"ieee": "00:12:4b:00:02:aa:aa:aa", "lqi": "180", "relationship": "Child"},
                {"ieee": "00:12:4b:00:03:bb:bb:bb", "lqi": "95", "relationship": "Child"},
            ],
        },
        {
            "ieee": "00:12:4b:00:02:aa:aa:aa",
            "name": "Living Room Router",
            "device_type": "Router",
            "lqi": 180,
            "neighbors": [
                {"ieee": "00:12:4b:00:01:ab:cd:ef", "lqi": "165", "relationship": "Parent"},
                {"ieee": "00:12:4b:00:04:cc:cc:cc", "lqi": "140", "relationship": "Child"},
            ],
        },
        {
            "ieee": "00:12:4b:00:03:bb:bb:bb",
            "name": "Kitchen Router",
            "device_type": "Router",
            "lqi": 95,
            "neighbors": [
                {"ieee": "00:12:4b:00:01:ab:cd:ef", "lqi": "120", "relationship": "Parent"},
            ],
        },
        {
            "ieee": "00:12:4b:00:04:cc:cc:cc",
            "name": "Bedroom Sensor",
            "device_type": "EndDevice",
            "lqi": 140,
            "neighbors": [
                {"ieee": "00:12:4b:00:02:aa:aa:aa", "lqi": "130", "relationship": "Parent"},
            ],
        },
    ]


@pytest.fixture
def sample_zha_devices_no_neighbors():
    """Sample ZHA device list without neighbor data (flat topology)."""
    return [
        {
            "ieee": "00:12:4b:00:01:ab:cd:ef",
            "name": "Coordinator",
            "device_type": "Coordinator",
            "lqi": 255,
        },
        {
            "ieee": "00:12:4b:00:02:aa:aa:aa",
            "name": "Living Room Router",
            "device_type": "Router",
            "lqi": 180,
        },
        {
            "ieee": "00:12:4b:00:04:cc:cc:cc",
            "name": "Bedroom Sensor",
            "device_type": "EndDevice",
            "lqi": 90,
        },
    ]
