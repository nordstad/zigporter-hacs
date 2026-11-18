# Installation

## Requirements

- Home Assistant **2024.8.0** or newer
- One of:
  - **Zigbee2MQTT** with MQTT integration configured
  - **ZHA** integration configured

## Home Assistant Marketplace

On Home Assistant 2026.11 or newer, install Zigporter through the Marketplace.
Zigporter is not yet listed in the default catalog, so add it as a custom
repository.

The button below opens Zigporter in the Marketplace and requires My Home
Assistant to be configured:

[![Open Zigporter in the Home Assistant Marketplace or HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=nordstad&repository=zigporter-hacs&category=integration)

If the repository is not added automatically:

1. Go to **Settings → Marketplace** and select **Custom repositories** from the
   three-dot menu.
2. Add `nordstad/zigporter-hacs` with the type **Integration**.

Then find Zigporter in the Marketplace, install it, and restart Home Assistant.

## HACS (older Home Assistant versions)

On Home Assistant versions older than 2026.11, use HACS instead:

1. Open HACS and select **Custom repositories** from the three-dot menu.
2. Add `nordstad/zigporter-hacs` with the type **Integration**.
3. Find Zigporter and install it.
4. Restart Home Assistant.

## Manual installation

Copy `custom_components/zigporter/` to your Home Assistant
`config/custom_components/` directory and restart.

## Verify installation

After restarting, go to **Settings → Devices & Services → Add Integration** and
search for "Zigporter". If it appears, the installation was successful.

!!! note
    After installing, refresh your browser (F5) before adding the dashboard card.
    The card resource is registered on integration load, but the browser needs
    a page refresh to pick it up.
