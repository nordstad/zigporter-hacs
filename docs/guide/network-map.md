# Network map

The network map visualizes your Zigbee mesh as a radial SVG — devices arranged in concentric rings by hop distance from the coordinator, with color-coded LQI links showing signal quality.

## How it works

1. Click **Scan** in the card to trigger a topology request.
2. The integration queries your Zigbee backend for the full device/neighbor table.
3. A BFS tree is built using bidirectional LQI for best-path parent selection.
4. Devices are placed radially — one ring per hop level — with collision resolution.
5. The SVG is delivered via WebSocket and cached to disk.

## Backends

### Zigbee2MQTT

Publishes to `zigbee2mqtt/bridge/request/networkmap` via MQTT. The response includes full routing tables with LQI values for each link.

Scan times depend on network size:

| Devices | Typical scan time |
|---------|-------------------|
| 10–20 | 15–30s |
| 30–50 | 40–70s |
| 50–100 | 1–3 min |
| 100+ | 3–9 min |

### ZHA

Reads device list and neighbor tables from the ZHA gateway. ZHA maps may lack routing data, producing a flatter topology with fewer visible hops.

## Interactions

- **Pan** — click and drag the map
- **Zoom** — mouse wheel or pinch-to-zoom on touch devices
- **Reset** — click "Reset" button to return to the default view

## LQI thresholds

Link Quality Indicator (LQI) is a 0–255 value reported by Zigbee devices. Higher is better.

| Range | Color | Meaning |
|-------|-------|---------|
| Above warning threshold | Green | Good signal |
| Between warning and critical | Yellow | Degraded signal |
| Below critical threshold | Red | Poor signal — may drop packets |

Default thresholds: warning at **50**, critical at **20**. Configure in integration options.

## Stats line

The stats bar below the map shows:

```
Z2M · 48 devices · 9 hops · 66.8s
```

- Backend name (Z2M or ZHA)
- Total device count
- Maximum hop depth
- Scan duration

## Caching

Scan results are saved to `/config/zigporter/network_map_cache.json` and persist across HA restarts. The map loads from cache on startup — click **Scan** to capture a fresh topology.

With `Cache TTL = 0` (default), the cached map never auto-expires. Set a value (in seconds) if you want the card to show a "stale" indicator after a certain period.
