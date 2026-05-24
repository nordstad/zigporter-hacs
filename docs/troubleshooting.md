# Troubleshooting

## Common issues

### "Invalid handler specified" error

**Cause:** Import error in the integration Python files — usually a truncated file copy or stale bytecode cache.

**Fix:**

1. Check the real traceback in **Settings → System → Logs** (search for "zigporter").
2. Delete the bytecode cache:
   ```
   rm -rf /config/custom_components/zigporter/__pycache__/
   ```
3. Restart Home Assistant.

### Card not appearing after install

The card JavaScript is registered when the integration loads, but the browser needs a page refresh to pick it up.

**Fix:** Refresh the browser with `F5` (or `Cmd+R` on macOS).

### "Configuration error" after hard refresh

**Cause:** Home Assistant loads custom card scripts as `<script type="module">` (deferred). On hard refresh (`Ctrl+Shift+R`), the browser bypasses all caches and re-downloads everything — HA's frontend renders cards before the module finishes loading. Since the custom element isn't defined yet, HA shows "Configuration error". This is a known platform limitation that affects all custom cards (Mushroom, Button Card, etc.).

**Fix:** Use a normal refresh (`F5` / `Cmd+R`) instead of hard refresh. If you've already hard-refreshed, a second normal refresh will resolve it.

### Scan times out

Large Zigbee networks (50+ devices) can take several minutes to scan. The Z2M coordinator queries each device sequentially.

**Fix:** Increase the scan timeout in integration options (default: 600s, max: 600s, range: 60–600s).

Typical scan times by network size:

| Devices | Expected time |
|---------|---------------|
| 10–20 | 15–30s |
| 30–50 | 40–70s |
| 50–100 | 1–3 min |
| 100+ | 3–9 min |

### Battery devices show "?" or relative time on ZHA

**Cause:** ZHA reads raw Zigbee neighbor tables at scan time. Battery devices are asleep during this read and cannot report their LQI. This is a ZHA platform limitation — Z2M does not have this issue because it accumulates signal data from ongoing communication.

**What you'll see:**

- Badge shows relative time (e.g. "2m") if the device communicated within the last 2 hours — this confirms the device is alive
- Badge shows "?" if there's no recent communication — genuinely unknown status
- Edge is solid green (recently seen) or gray dashed (unknown)

**Fix:** If you need accurate signal data for all devices, switch to the Zigbee2MQTT backend.

### Map shows flat topology (no hops)

**Cause:** ZHA backend often lacks full routing table data.

**Options:**

- Switch to Zigbee2MQTT backend if available — it provides complete neighbor/LQI tables.
- The ZHA map will still show all devices, just without multi-hop depth.

### Stale map after HA restart

The integration loads the last cached scan from disk on startup. This is expected behavior — click **Scan** to capture fresh topology.

If you see an old `.gz` sidecar file causing issues:
```
rm /config/custom_components/zigporter/static/*.gz
```

### Wrong backend auto-detected

If you have both ZHA and Zigbee2MQTT installed, the integration setup may pick the wrong one.

**Fix:** During setup (or in options afterward), explicitly select your preferred backend. You can switch between them in **Configure** without reinstalling.

### MQTT not configured error

When selecting Zigbee2MQTT as backend, the integration checks that the MQTT integration is set up in Home Assistant.

**Fix:** Ensure the [MQTT integration](https://www.home-assistant.io/integrations/mqtt/) is configured and connected before adding Zigporter.

## Browser cache issues

Home Assistant static files can be aggressively cached. If you see stale card behavior after an update:

1. Hard-refresh: `Ctrl+F5` / `Cmd+Shift+R`
2. Clear browser cache for your HA URL
3. Check for stale `.gz` files in the static directory

!!! note
    The integration uses `cache_headers=False` to prevent browser caching issues, but HA may still gzip static files into `.gz` sidecars that serve stale content.

## Debug logging

Enable debug logging for deeper diagnostics:

```yaml
# configuration.yaml
logger:
  logs:
    custom_components.zigporter: debug
```

Restart HA, then check **Settings → System → Logs** for detailed scan progress and timing information.

## Getting help

- [GitHub Issues](https://github.com/nordstad/zigporter-hacs/issues) — bug reports and feature requests
- Check existing issues before filing — your problem may already be tracked
