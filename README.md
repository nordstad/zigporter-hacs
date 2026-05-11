# Zigporter — HACS Integration

Zigbee network topology map for Home Assistant. Visualize your mesh network with LQI signal quality indicators, routing paths, and device hierarchy.

Supports both **Zigbee2MQTT** and **ZHA** backends.

## Installation

### HACS (recommended)

1. Open HACS in Home Assistant.
2. Click the three dots menu → **Custom repositories**.
3. Add `nordstad/zigporter-hacs` with type **Integration**.
4. Search for "Zigporter" and install.
5. Restart Home Assistant.

### Manual

Copy the `custom_components/zigporter/` folder to your HA `config/custom_components/` directory and restart.

## Setup

1. Go to **Settings → Devices & Services → Add Integration**.
2. Search for "Zigporter".
3. Select your Zigbee backend (Auto-detect, Zigbee2MQTT, or ZHA).
4. If using Zigbee2MQTT, confirm the MQTT topic prefix (default: `zigbee2mqtt`).

### Options

After setup, click **Configure** on the Zigporter integration to adjust:

- **Warning LQI threshold** (default: 50) — links below this show yellow.
- **Critical LQI threshold** (default: 20) — links below this show red.
- **Cache TTL** (default: 300s) — how long to cache the map before re-scanning.

## Dashboard Card

### Add the resource

Go to **Settings → Dashboards → Resources** (top right three dots menu) and add:

- **URL:** `/zigporter/zigporter-network-map-card.js`
- **Type:** JavaScript Module

### Add the card

Add a manual card to your dashboard:

```yaml
type: custom:zigporter-network-map-card
```

### Card options

```yaml
type: custom:zigporter-network-map-card
title: Zigbee Network Map
show_stats: true
auto_refresh_interval: 60
```

| Option | Default | Description |
|--------|---------|-------------|
| `title` | Zigbee Network Map | Card header text |
| `show_stats` | `true` | Show device count, max depth, and scan duration |
| `auto_refresh_interval` | `0` (disabled) | Auto-refresh interval in seconds |

Click the refresh button on the card to force a fresh network scan (bypasses cache).

## How it works

The integration requests a network topology scan from your Zigbee backend:

- **Zigbee2MQTT:** Publishes to `zigbee2mqtt/bridge/request/networkmap` via MQTT and parses the response. The scan takes 10–60 seconds depending on network size.
- **ZHA:** Reads the device list and neighbor tables from ZHA's gateway. Falls back to a flat topology if no neighbor scan data is available.

The topology is processed into a routing tree (best-path parent selection using bidirectional LQI), rendered as an SVG, and delivered to the card via WebSocket.

## Limitations

- ZHA maps are less detailed than Z2M maps — ZHA may not have routing path data, resulting in a flat or approximate topology.
- The first scan after HA restart may take longer as the Zigbee coordinator queries each device.
- Very large networks (100+ devices) may produce large SVGs — use the cache TTL to avoid repeated scans.

## Links

- [Zigporter CLI](https://github.com/nordstad/zigporter)
- [Zigporter docs](https://nordstad.github.io/zigporter/)

## License

MIT
