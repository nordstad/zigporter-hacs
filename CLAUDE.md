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
uv run pytest tests/ -v          # Python tests
npm test                         # JS tests (coverage must be 100%)
npx prettier --check "custom_components/zigporter/static/**/*.js" "tests/js/**/*.js" "web-test-runner.config.mjs"
```

Before committing, always run linting and both test suites to catch CI failures locally.

## Git Workflow

After merging a PR, always delete the branch both locally and on remote:

```bash
git branch -d <branch>
git push origin --delete <branch>
```

## Deployment

See project memory for deployment details (private, not in repo).

## Gotchas

- HA gzips static files → `.gz` sidecar can serve stale content. Delete `.gz` if present.
- `cache_headers=True` sets `max-age=31536000` — browser ignores even hard-refresh. Keep it `False`.
- `viewBox` must encompass ring circles, not just node positions (rings extend beyond sparse node areas).
- SVG `max-height` clips inline SVG; use explicit `height` with `preserveAspectRatio` for scaling.
- Tight viewBox from node positions alone clips the outer rings in directions with no nodes.
- **Import errors → "Invalid handler specified"**: If config_flow.py imports new symbols from const.py, HA shows this cryptic error. The real traceback is in Settings → System → Logs. Common cause: file not fully copied (truncated paste), or `.pyc` cache serving stale bytecode. Fix: delete `/config/custom_components/zigporter/__pycache__/` after copying Python files, then restart HA.
- **Backend auto-detect**: User has both ZHA and Z2M installed. Auto-detect picks ZHA first (checked before MQTT). Must explicitly select "Zigbee2MQTT" during integration setup to use Z2M.
- **Z2M scan timeout**: Z2M networkmap MQTT request takes 60-70s for 48 devices (9 hops). Larger networks reported up to 9 min. Timeout is configurable in integration options (default 180s, range 60-600s).

## Current State

- Pan/zoom implemented (wheel, drag, pinch-to-zoom, reset button)
- Buttons: text labels ("Reset", "Scan") instead of unicode icons
- Stats line shows backend: "Z2M · 48 devices · 9 hops · 66.8s"
- Scan timeout configurable via integration options

## Future Improvements

- Dev iteration workflow (git push → HA pull via shell_command)
- Device name readability at current scale
- Mobile/tablet responsive sizing
