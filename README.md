# Zigporter

[![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://hacs.xyz)
[![GitHub Release](https://img.shields.io/github/v/release/nordstad/zigporter-hacs)](https://github.com/nordstad/zigporter-hacs/releases)
[![Validate](https://github.com/nordstad/zigporter-hacs/actions/workflows/validate.yml/badge.svg)](https://github.com/nordstad/zigporter-hacs/actions/workflows/validate.yml)
[![License: MIT](https://img.shields.io/github/license/nordstad/zigporter-hacs)](LICENSE)

<p align="center">
  <img src="images/zigporter_logo_small.png" alt="Zigporter" width="128">
</p>

Zigbee network topology map for Home Assistant. Visualize your mesh network with LQI signal quality indicators, routing paths, and device hierarchy.

Supports both **Zigbee2MQTT** and **ZHA** backends.

> **Early Development** — Expect breaking changes between releases. Pin to a specific version if stability matters.

## Installation

### HACS (recommended)

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=nordstad&repository=zigporter-hacs&category=integration)

Or manually:

1. Open HACS → three dots menu → **Custom repositories**.
2. Add `nordstad/zigporter-hacs` with type **Integration**.
3. Search for "Zigporter" and install.
4. Restart Home Assistant.

### Manual

Copy `custom_components/zigporter/` to your HA `config/custom_components/` directory and restart.

## Setup

1. **Settings → Devices & Services → Add Integration** → search "Zigporter".
2. Select your Zigbee backend (**Zigbee2MQTT** or **ZHA**).
3. If using Zigbee2MQTT, confirm the MQTT topic prefix (default: `zigbee2mqtt`).

### Options

Click **Configure** on the integration to adjust:

| Option | Default | Description |
|--------|---------|-------------|
| Warning LQI | 50 | Links below this show yellow |
| Critical LQI | 20 | Links below this show red |
| Scan timeout | 180s | Max wait for network scan (Z2M can take 60–70s for ~50 devices) |

## Dashboard Card

The card JS is registered automatically — no manual resource setup needed.

Add a card to your dashboard:

```yaml
type: custom:zigporter-network-map-card
```

| Option | Default | Description |
|--------|---------|-------------|
| `title` | Zigbee Network Map | Card header text |
| `show_stats` | `true` | Show device count, hops, and scan duration |

## How It Works

The integration requests a network topology scan from your Zigbee backend, builds a routing tree using bidirectional LQI for best-path parent selection, renders it as a radial SVG, and delivers it to the card via WebSocket.

- **Zigbee2MQTT** — publishes to `zigbee2mqtt/bridge/request/networkmap` via MQTT
- **ZHA** — reads device list and neighbor tables from the ZHA gateway

## Limitations

- ZHA maps may lack routing data, producing a flat topology.
- First scan after HA restart can be slow (coordinator queries each device).
- Very large networks (100+ devices) produce large SVGs — the cache avoids repeated scans.

## Related: Zigporter CLI

This HACS integration is the Home Assistant-native companion to [**Zigporter CLI**](https://github.com/nordstad/zigporter) — a terminal tool for managing your Zigbee network:

- **Migrate** devices between ZHA and Zigbee2MQTT (both directions) with automated entity/dashboard cascade
- **Rename** devices and entities with full HA reference updates (automations, scripts, dashboards)
- **Network map** — the same radial SVG visualization, exported as a standalone file
- **Stale device cleanup** — find and remove offline/ghost devices

Install via `uv tool install zigporter`, `pip install zigporter`, or `brew tap nordstad/zigporter && brew install zigporter`.

[Documentation](https://nordstad.github.io/zigporter/) · [Interactive demo](https://nordstad.github.io/zigporter/interactive-demo/)

## License

[MIT](LICENSE)
