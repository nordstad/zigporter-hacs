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

**ZHA limitations compared to Z2M:**

- **Battery device LQI** — ZHA reads raw Zigbee neighbor tables at scan time. Sleepy battery devices are asleep during this read and report LQI=0 (no measurement). Z2M accumulates signal data from ongoing communication, so battery devices always show a real value.
- **Topology depth** — ZHA's neighbor tables only come from routers. End devices that no router lists as a neighbor appear directly attached to the coordinator regardless of their actual routing path.

For ZHA battery devices with LQI=0, Zigporter uses the device's `last_seen` timestamp: if the device communicated within the last 2 hours, the badge shows relative time (e.g. "2m", "1h") in green to indicate the device is alive but signal strength is unmeasurable.

## Interactions

- **Pan** — click and drag the map
- **Zoom** — mouse wheel or pinch-to-zoom on touch devices
- **Reset** — click "Reset" button to return to the default view

## View modes

### Tree (default)

Shows the computed routing tree — each device connected to its best-path parent based on bidirectional LQI scoring.

### Mesh

Overlays all raw neighbor links as dashed gray lines on top of the tree. This shows the full connectivity between devices that Z2M/ZHA reports, including alternate paths not used for routing.

### Alerts

Dims all healthy devices and highlights only those with critical signal (LQI below the critical threshold). Useful for quickly spotting problem devices in large networks.

## LQI thresholds

Link Quality Indicator (LQI) is a 0–255 value reported by Zigbee devices. Higher is better.

| Range | Color | Edge style | Meaning |
|-------|-------|------------|---------|
| Above warning threshold | Green | Solid | Good signal |
| Between warning and critical | Yellow | Solid | Degraded signal |
| Below critical threshold (1–19) | Red | Solid | Poor signal — may drop packets |
| 0 (no measurement) | Gray | Dashed | No data (sleepy device) |

Default thresholds: warning at **50**, critical at **20**. Configure in integration options.

### LQI=0: No measurement vs. dead device

LQI=0 means "no measurement available" — **not** "zero signal." This typically happens with battery-powered sleepy devices that were asleep during the network scan.

- **Badge**: Shows "?" or relative time (e.g. "2m") if the device recently communicated
- **Edge**: Gray dashed line (no alarm color)
- **Node**: No red glow ring

Real problems (LQI 1–19) still get the full red/critical treatment with glow rings.

## Stats line

The stats bar below the map shows:

```
Z2M · 48 devices · 9 hops · 66.8s · estimated
```

- Backend name (Z2M or ZHA)
- Total device count
- Maximum hop depth
- Scan duration
- "estimated" — the routing tree is computed heuristically from neighbor data, not actual routing tables

## Caching

Scan results are saved to `/config/zigporter/network_map_cache.json` and persist across HA restarts. The map loads from cache on startup — click **Scan** to capture a fresh topology.

With `Cache TTL = 0` (default), the cached map never auto-expires. Set a value (in seconds) if you want the card to show a "stale" indicator after a certain period.
