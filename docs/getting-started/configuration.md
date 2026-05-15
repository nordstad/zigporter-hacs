# Configuration

## Initial setup

1. Go to **Settings → Devices & Services → Add Integration**.
2. Search for "Zigporter".
3. Select your Zigbee backend (**Zigbee2MQTT** or **ZHA**).
4. If using Zigbee2MQTT, confirm the MQTT topic prefix (default: `zigbee2mqtt`).

## Integration options

Click **Configure** on the Zigporter integration card to adjust settings.

| Option | Default | Range | Description |
|--------|---------|-------|-------------|
| Backend | *(from setup)* | Z2M / ZHA | Switch between backends without reinstalling |
| MQTT topic | `zigbee2mqtt` | — | Topic prefix for Zigbee2MQTT |
| Warning LQI | `50` | 1–255 | Links below this threshold show yellow |
| Critical LQI | `20` | 1–255 | Links below this threshold show red |
| Scan timeout | `600` | 60–600s | Maximum wait time for a network scan |
| Cache TTL | `0` | 0–3600s | Seconds before cached map expires (`0` = manual refresh only) |
| Hop colors 1–4 | *(empty)* | Hex color | Custom ring gradient colors (see [Colors & theming](../guide/colors.md)) |
| Hop opacity | `0.80` | 0.1–1.0 | Opacity of hop ring fills |

!!! tip
    If you have both ZHA and Zigbee2MQTT running, you can switch between them in options to view either network — no need to remove and re-add the integration.

## Dashboard card

The card JS is registered automatically — no manual resource setup needed.

### Adding the card (Panel view — recommended)

The network map works best as a full-page card in a **Panel** view:

1. Open your dashboard → **pencil icon** (top-right) → edit mode.
2. Click the **+** tab to create a new view.
3. Select **Panel (single card)** as the layout, give it a title (e.g. "Zigbee Network"), click **Save**.
4. Click **+ Add card** → search for "Zigporter" — or choose **Manual** and paste:

```yaml
type: custom:zigporter-network-map-card
```

### Card options

| Option | Default | Description |
|--------|---------|-------------|
| `title` | `Zigbee Network Map` | Card header text |
| `show_stats` | `true` | Show device count, hops, and scan duration |

### Alternative layouts

You can also add the card inside a Sections or Masonry view — it will just be smaller. The card uses `height: calc(100vh - 140px)` in Panel mode for full viewport coverage.
