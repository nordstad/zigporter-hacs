# Installation

## Requirements

- Home Assistant **2024.8.0** or newer
- One of:
    - **Zigbee2MQTT** with MQTT integration configured
    - **ZHA** integration configured

## HACS (recommended)

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=nordstad&repository=zigporter-hacs&category=integration)

Or manually:

1. Open HACS → three dots menu → **Custom repositories**.
2. Add `nordstad/zigporter-hacs` with type **Integration**.
3. Search for "Zigporter" and install.
4. Restart Home Assistant.

## Manual installation

Copy `custom_components/zigporter/` to your Home Assistant `config/custom_components/` directory and restart.

## Verify installation

After restarting, go to **Settings → Devices & Services → Add Integration** and search for "Zigporter". If it appears, the installation was successful.

!!! note
    After installing, refresh your browser (F5) before adding the dashboard card. The card resource is registered on integration load, but the browser needs a page refresh to pick it up.
