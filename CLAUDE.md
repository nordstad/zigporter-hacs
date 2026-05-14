# CLAUDE.md — Zigporter HACS Integration

## Project Overview

Custom Home Assistant integration (HACS) that renders a radial Zigbee network map from Zigbee2MQTT topology data as an inline SVG in a Lovelace custom card.

## Architecture

- `__init__.py` — Integration setup, static file registration (`cache_headers=False`), disk cache loading
- `websocket_api.py` — WebSocket handler (`zigporter/network_map`), scan orchestration, disk cache persistence
- `network_map.py` — Topology parsing from Zigbee2MQTT (BFS tree, depth map, LQI map)
- `network_map_svg.py` — SVG renderer: radial layout, collision resolution, ring gradients, legend
- `static/zigporter-network-map-card.js` — Lovelace custom card (vanilla Web Component, shadow DOM)
- `config_flow.py` — Config entry setup (minimal)

## Key Design Decisions

- **Manual refresh only** (`DEFAULT_CACHE_TTL = 0`): SVG is cached to disk, user clicks ↻ to re-scan
- **Disk persistence**: Cache saved to `/config/zigporter/network_map_cache.json`
- **No auto-refresh**: Scans take 15-70s, too expensive for polling
- **ViewBox = outermost ring + LABEL_MARGIN**: Ensures full circle is visible without clipping
- **CSS `height: calc(100vh - 140px)` + `preserveAspectRatio="xMidYMid meet"`**: SVG fits viewport without scroll

## Development

```bash
uv run pytest tests/ -v          # 23 tests
```

## Deployment to HA

HA runs in Proxmox VM at 192.168.3.81. SSH port goes to Traefik host (wrong machine), not HA.

**Working method**: Copy files via Studio Code Server addon (direct filesystem access to `/config/`).

After deploying changes:

1. Delete `/config/zigporter/network_map_cache.json` if SVG renderer changed
2. Restart HA
3. Clear browser site data (if JS was cached with old `cache_headers=True`)

## Gotchas

- HA gzips static files → `.gz` sidecar can serve stale content. Delete `.gz` if present.
- `cache_headers=True` sets `max-age=31536000` — browser ignores even hard-refresh. Keep it `False`.
- `viewBox` must encompass ring circles, not just node positions (rings extend beyond sparse node areas).
- SVG `max-height` clips inline SVG; use explicit `height` with `preserveAspectRatio` for scaling.
- Tight viewBox from node positions alone clips the outer rings in directions with no nodes.

## Future Improvements

- Dev iteration workflow (git push → HA pull via shell_command)
- Pan/zoom interaction on the SVG
- Device name readability at current scale
- Mobile/tablet responsive sizing
