# Configuration

## Initial setup

[![Add Integration to your Home Assistant instance.](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=zigporter)

Or manually:

1. Go to **Settings → Devices & Services → Add Integration**.
2. Search for "Zigporter".
3. Select your Zigbee backend (**Zigbee2MQTT** or **ZHA**).
4. If using Zigbee2MQTT, confirm the MQTT topic prefix (default: `zigbee2mqtt`).
5. Optionally give it a **Name** (for example "Building 1"). It is used as the entry name and as the default card title. You can rename the entry later in Home Assistant.

## Integration options

Click **Configure** on the Zigporter integration card to adjust settings.

| Option | Default | Range | Description |
|--------|---------|-------|-------------|
| Backend | *(from setup)* | Z2M / ZHA | Switch between backends without reinstalling |
| MQTT topic | `zigbee2mqtt` | — | Topic prefix for Zigbee2MQTT |
| Warning LQI | `50` | 1–255 | Links below this threshold show yellow |
| Critical LQI | `20` | 1–255 | Links below this threshold show red |
| Scan timeout | `1000` | 60–1200s | Maximum wait time for a network scan |
| Cache TTL | `0` | 0–3600s | Seconds before cached map expires (`0` = manual refresh only) |
| Hop colors 1–4 | *(built-in palette)* | Hex color | Custom ring gradient colors (see [Colors & theming](../guide/colors.md)) |
| Hop opacity | `0.90` | 0.1–1.0 | Opacity of hop ring fills |

Each Zigporter entry has its own options, so thresholds, timeout and colors can differ per bridge.

!!! tip
    If you have both ZHA and Zigbee2MQTT running, you can switch between them in options, or add one entry for each (see [Multiple bridges](#multiple-bridges)).

## Multiple bridges

Add **one entry per Zigbee2MQTT topic prefix**, for example `zigbee2mqtt/b1`, `zigbee2mqtt/b2` and `zigbee2mqtt/b3` when several Zigbee2MQTT instances share one MQTT broker.

1. Go to **Settings → Devices & Services → Zigporter → Add entry**.
2. Select **Zigbee2MQTT**, enter the topic prefix and (optionally) a name.
3. Repeat for each bridge, then add one [card per bridge](#one-card-per-bridge).

Rules:

- Each Zigbee2MQTT topic prefix can be used by one entry only.
- Only **one ZHA** entry is possible, because Home Assistant supports one ZHA setup. A ZHA entry and Zigbee2MQTT entries can exist side by side.
- Every entry keeps its own cached map and scan history.
- Existing installs are not affected: your current entry, its cache and its cards keep working as before.

## Dashboard card

The card JS is registered automatically — no manual resource setup needed.

### Adding the card

!!! warning
    The card must be added to its own **Panel** view. It is sized to fill the whole page and does not display correctly in Sections or Masonry views.

1. Open your dashboard → **pencil icon** (top-right) → edit mode.
2. Click the **+** tab to create a new view.
3. Select **Panel (single card)** as the layout, give it a title (e.g. "Zigbee Network"), click **Save**.
4. Click **+ Add card** → search for "Zigporter" — or choose **Manual** and paste:

```yaml
type: custom:zigporter-network-map-card
```

### One card per bridge

Cards without `entry_id` always show your original Zigporter entry. To show another bridge, pick it in the card editor (**Zigporter entry**), or set `entry_id` in YAML:

```yaml
type: custom:zigporter-network-map-card
entry_id: 01J0EXAMPLEENTRYID
```

Tip: choose the entry in the visual editor first, then switch to the code editor to see the generated `entry_id`.

The card fills the whole page, so create **one Panel view per bridge** ("Building 1", "Building 2", …) and put one card in each. Scans, history and search work per card. When an entry is selected, the card title defaults to the entry name and the stats line shows the topic, for example `Z2M · zigbee2mqtt/b2 · 45 devices · …`.

### Card options

| Option | Default | Description |
|--------|---------|-------------|
| `title` | `Zigbee Network Map` | Card header text |
| `show_stats` | `true` | Show device count, hops, and scan duration |
| `entry_id` | *(original entry)* | Which Zigporter entry (bridge) the card shows. Picked in the card editor |

If `title` is not set and `entry_id` is, the title is the entry name.
