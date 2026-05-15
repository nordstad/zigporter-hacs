# Colors & theming

The radial map uses a gradient of four colors for hop rings (concentric circles around the coordinator). You can customize these to match your Home Assistant theme.

## Default palette

| Ring | Hex | Preview |
|------|-----|---------|
| Hop 1 (closest) | `#202940` | Dark navy |
| Hop 2 | `#4B4038` | Dark brown |
| Hop 3 | `#9A8678` | Warm taupe |
| Hop 4+ (furthest) | `#CAAA98` | Light sand |

Default opacity: **0.80**

## Finding colors

[Color Hunt](https://colorhunt.co/) is a great resource for discovering 4-color palettes that work well together. Browse palettes tagged "dark", "earth", or "pastel" and copy the hex values directly into the integration options.

## Custom colors

Set all four hop colors in **Settings → Devices & Services → Zigporter → Configure**:

| Field | Description |
|-------|-------------|
| Hop color 1 | Innermost ring (1 hop from coordinator) |
| Hop color 2 | Second ring |
| Hop color 3 | Third ring |
| Hop color 4 | Outermost ring (4+ hops) |
| Hop opacity | Fill opacity for all rings (0.1–1.0) |

!!! warning
    You must set all four colors or leave all empty. Partial palettes are rejected.

### Color format

Colors accept 6-digit hex values with or without the `#` prefix:

- `#1E3A5F` ✓
- `1E3A5F` ✓
- `#FFF` ✗ (must be 6 digits)

### Example: dark blue theme

| Field | Value |
|-------|-------|
| Hop color 1 | `#0D1B2A` |
| Hop color 2 | `#1B2838` |
| Hop color 3 | `#2E4057` |
| Hop color 4 | `#3A5A7C` |
| Hop opacity | `0.70` |

### Example: warm earth tones

| Field | Value |
|-------|-------|
| Hop color 1 | `#2D1B0E` |
| Hop color 2 | `#4A3228` |
| Hop color 3 | `#7A5C4F` |
| Hop color 4 | `#A68B7B` |
| Hop opacity | `0.85` |

## Node colors

Node colors are not configurable and follow device type:

| Type | Color | Hex |
|------|-------|-----|
| Coordinator | Amber | `#f59e0b` |
| Router | Blue | `#0ea5e9` |
| End device | Slate | `#475569` |

## Edge colors

Edge (link) colors are determined by LQI thresholds:

| Quality | Color | Hex |
|---------|-------|-----|
| Good (above warning) | Green | `#22c55e` |
| Warning | Amber | `#f59e0b` |
| Critical | Red | `#ef4444` |

Edge opacity: **0.55** (fixed).
