# Zigporter

[![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://hacs.xyz)
[![GitHub Release](https://img.shields.io/github/v/release/nordstad/zigporter-hacs)](https://github.com/nordstad/zigporter-hacs/releases)
[![Validate](https://github.com/nordstad/zigporter-hacs/actions/workflows/validate.yml/badge.svg)](https://github.com/nordstad/zigporter-hacs/actions/workflows/validate.yml)
[![Docs](https://img.shields.io/badge/docs-nordstad.github.io-teal)](https://nordstad.github.io/zigporter-hacs/)
[![License: MIT](https://img.shields.io/github/license/nordstad/zigporter-hacs)](https://github.com/nordstad/zigporter-hacs/blob/main/LICENSE)

<p align="center">
  <img src="https://raw.githubusercontent.com/nordstad/zigporter-hacs/main/custom_components/zigporter/brand/icon.png" alt="Zigporter" width="128">
</p>

Zigbee network topology map for Home Assistant. Visualize your mesh network with LQI signal quality indicators, routing paths, and device hierarchy.

Supports both **Zigbee2MQTT** and **ZHA** backends.

**[Documentation](https://nordstad.github.io/zigporter-hacs/)** · [Getting started](https://nordstad.github.io/zigporter-hacs/getting-started/installation/) · [Troubleshooting](https://nordstad.github.io/zigporter-hacs/troubleshooting/)

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
| Backend | *(from setup)* | Switch between Zigbee2MQTT and ZHA without reinstalling |
| MQTT topic | `zigbee2mqtt` | Topic prefix for Z2M (only relevant when backend is Z2M) |
| Warning LQI | 50 | Links below this show yellow |
| Critical LQI | 20 | Links below this show red |
| Scan timeout | 600s | Max wait for network scan (60–600s) |
| Cache TTL | 0 | Seconds to cache the map (0 = manual refresh only) |
| Hop colors 1–4 | `#101819` `#1C2829` `#2B3A3A` `#425352` | Custom ring gradient colors ([details](https://nordstad.github.io/zigporter-hacs/guide/colors/)) |
| Hop opacity | 0.90 | Opacity of hop ring fills (0.1–1.0) |

> **Tip:** If you have both ZHA and Zigbee2MQTT running, you can switch between them in options to view either network — no need to remove and re-add the integration.

## Dashboard Card

The card JS is registered automatically — no manual resource setup needed.

> **First install:** After adding the integration, refresh your browser (F5) before adding the card. The card resource is registered on integration load, but the browser needs a page refresh to pick it up.

### Adding the card (recommended: Panel view)

The network map works best as a full-page card in a **Panel** view:

1. Open your dashboard and click the **pencil icon** (top-right) to enter edit mode.
2. Click the **+** tab to create a new view.
3. In the view settings, select **Panel (single card)** as the layout, give it a title (e.g. "Zigbee Network"), and click **Save**.
4. Click **+ Add card** (bottom-right).
5. Search for **"Zigporter"** — or scroll to the bottom and choose **Manual**, then paste:

```yaml
type: custom:zigporter-network-map-card
```

6. Click **Save**, then **Done** to exit edit mode.

The map will appear empty until you click **Scan** to request the first network topology.

> **Alternative:** You can also add the card inside a Sections or Masonry view by clicking the **+** inside any section — the card will just be smaller.

### Card options

| Option | Default | Description |
|--------|---------|-------------|
| `title` | Zigbee Network Map | Card header text |
| `show_stats` | `true` | Show device count, hops, and scan duration |

## How It Works

The integration requests a network topology scan from your Zigbee backend, builds a routing tree using bidirectional LQI for best-path parent selection, renders it as a radial SVG, and delivers it to the card via WebSocket.

- **Zigbee2MQTT** — publishes to `zigbee2mqtt/bridge/request/networkmap` via MQTT
- **ZHA** — reads device list and neighbor tables from the ZHA gateway

> **Note:** The network map is a point-in-time snapshot. Zigbee mesh networks continuously optimize their routing, and devices may join or leave. The card displays the scan date in the stats line so you know how current the map is. Click **Scan** to capture a fresh topology.

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
