"""SVG renderer for Zigbee network map — uses xml.etree.ElementTree (no svgwrite).

Full port of the CLI radial layout with ring gradients, collision resolution,
label pills, edge LQI labels, legend box, glow filters, and node type distinction.
"""

from __future__ import annotations

import math
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Any

# ── Visual constants ──────────────────────────────────────────────────────────

MIN_RING_GAP = 200
ANGULAR_PADDING = 50
LABEL_OFFSET = 30
LABEL_MARGIN = 340

HOP_COLORS = [
    "#202940",  # dark navy
    "#4B4038",  # dark brown
    "#9A8678",  # warm tan
    "#CAAA98",  # light cream
]

NODE_R_COORD = 28
NODE_R_ROUTER = 20
NODE_R_END = 14

COORD_FILL = "#f59e0b"
ROUTER_FILL = "#0ea5e9"
END_FILL = "#475569"

TEXT_PRIMARY = "#e2e8f0"
TEXT_DIM = "#64748b"

EDGE_GOOD = "#22c55e"
EDGE_WARN = "#f59e0b"
EDGE_CRIT = "#ef4444"
EDGE_OPACITY = 0.55

LABEL_FS = "12px"
DIM_FS = "11px"

COLLISION_GAP = 100
COLLISION_ITERS = 200

MAX_LABEL_LEN = 22
LABEL_ARC = MAX_LABEL_LEN * 6 + 10


# ── Helpers ───────────────────────────────────────────────────────────────────


def _edge_color(lqi: int, warn: int, crit: int) -> str:
    if lqi < crit:
        return EDGE_CRIT
    if lqi < warn:
        return EDGE_WARN
    return EDGE_GOOD


def _edge_width(lqi: int) -> float:
    return round(0.8 + (lqi / 255) * 2.8, 2)


def _annulus_path(cx: float, cy: float, r_inner: float, r_outer: float) -> str:
    """SVG path for a donut (annulus) shape centered at (cx, cy)."""
    if r_inner <= 0:
        return (
            f"M {cx - r_outer} {cy} "
            f"A {r_outer} {r_outer} 0 1 1 {cx + r_outer} {cy} "
            f"A {r_outer} {r_outer} 0 1 1 {cx - r_outer} {cy} Z"
        )
    return (
        f"M {cx - r_outer} {cy} "
        f"A {r_outer} {r_outer} 0 1 1 {cx + r_outer} {cy} "
        f"A {r_outer} {r_outer} 0 1 1 {cx - r_outer} {cy} Z "
        f"M {cx - r_inner} {cy} "
        f"A {r_inner} {r_inner} 0 1 0 {cx + r_inner} {cy} "
        f"A {r_inner} {r_inner} 0 1 0 {cx - r_inner} {cy} Z"
    )


def _compute_ring_radii(
    depth_map: dict[str, int], nodes: dict[str, dict[str, Any]]
) -> dict[int, float]:
    """Compute per-hop ring boundary radii so each ring has enough circumference."""
    max_hops = max((d for d in depth_map.values()), default=1)
    count_at_depth: dict[int, int] = {}
    for ieee, depth in depth_map.items():
        if depth > 0:
            count_at_depth[depth] = count_at_depth.get(depth, 0) + 1

    ring_radii: dict[int, float] = {}
    prev_r = 0.0
    for h in range(1, max_hops + 1):
        n = count_at_depth.get(h, 1)
        arc_per_device = max(2 * NODE_R_ROUTER + COLLISION_GAP, LABEL_ARC) + ANGULAR_PADDING
        required_node_r = (n * arc_per_device) / (2 * math.pi)
        min_for_content = 2 * required_node_r - prev_r + LABEL_OFFSET
        ring_radii[h] = max(min_for_content, prev_r + MIN_RING_GAP)
        prev_r = ring_radii[h]
    return ring_radii


def _node_fill(node_type: str) -> str:
    if node_type == "Coordinator":
        return COORD_FILL
    if node_type == "Router":
        return ROUTER_FILL
    return END_FILL


def _node_radius(node_type: str) -> int:
    if node_type == "Coordinator":
        return NODE_R_COORD
    if node_type == "Router":
        return NODE_R_ROUTER
    return NODE_R_END


# ── Angular layout ────────────────────────────────────────────────────────────


def _subtree_weights(ieee: str, children: dict[str, list[str]]) -> dict[str, int]:
    """Angular weight = max(ceil(sqrt(leaf_count)), subtree_depth)."""
    weights: dict[str, int] = {}

    def _calc(n: str) -> tuple[int, int]:
        kids = children.get(n, [])
        if not kids:
            weights[n] = 1
            return 1, 1
        results = [_calc(k) for k in kids]
        leaves = sum(lc for lc, _ in results)
        depth = max(d for _, d in results) + 1
        weights[n] = max(math.ceil(math.sqrt(leaves)), depth)
        return leaves, depth

    _calc(ieee)
    return weights


def _compute_path_min_lqi(
    parent_map: dict[str, str | None],
    lqi_map: dict[str, int],
) -> dict[str, int]:
    """Min LQI along the full chain from coordinator to each device."""
    cache: dict[str, int] = {}

    def _min(ieee: str) -> int:
        if ieee in cache:
            return cache[ieee]
        path: list[str] = []
        seen: set[str] = set()
        cur: str | None = ieee
        while cur is not None and cur not in cache and cur not in seen:
            seen.add(cur)
            path.append(cur)
            cur = parent_map.get(cur)
        base = cache[cur] if cur in cache else 255
        for node in reversed(path):
            if node in lqi_map:
                base = min(lqi_map[node], base)
            cache[node] = base
        return cache.get(ieee, 0)

    for ieee in parent_map:
        _min(ieee)
    return cache


def _assign_angles(
    ieee: str,
    children: dict[str, list[str]],
    leaf_counts: dict[str, int],
    angles: dict[str, float],
    start: float,
    end: float,
    depth_map: dict[str, int],
    nodes: dict[str, dict[str, Any]],
    ring_radii: dict[int, float],
) -> None:
    """Recursively assign angular midpoints using leaf-count-proportional slices."""
    angles[ieee] = (start + end) / 2
    kids = children.get(ieee, [])
    if not kids:
        return

    sorted_kids = sorted(kids, key=lambda k: -leaf_counts.get(k, 1))
    total = sum(leaf_counts.get(k, 1) for k in sorted_kids)
    span = end - start

    child_depth = depth_map.get(ieee, 0) + 1
    prev_r = ring_radii.get(child_depth - 1, 0.0)
    curr_r = ring_radii.get(child_depth, prev_r + MIN_RING_GAP)
    r_at_depth = max((prev_r + curr_r) / 2, 1.0)
    min_angles = [
        max(2 * _node_radius(nodes.get(k, {}).get("type", "EndDevice")) + COLLISION_GAP, LABEL_ARC)
        / r_at_depth
        for k in sorted_kids
    ]

    raw_spans = [span * leaf_counts.get(k, 1) / total for k in sorted_kids]
    floored = [max(raw, mn) for raw, mn in zip(raw_spans, min_angles)]
    floored_total = sum(floored)
    if floored_total > span:
        floored = [s * span / floored_total for s in floored]

    cursor = start
    for kid, kid_span in zip(sorted_kids, floored):
        _assign_angles(
            kid,
            children,
            leaf_counts,
            angles,
            cursor,
            cursor + kid_span,
            depth_map,
            nodes,
            ring_radii,
        )
        cursor += kid_span


# ── Collision resolution ──────────────────────────────────────────────────────


def _resolve_collisions(
    positions: dict[str, tuple[float, float]],
    angles: dict[str, float],
    depth_map: dict[str, int],
    nodes: dict[str, dict[str, Any]],
    cx: float,
    cy: float,
    ring_radii: dict[int, float],
) -> None:
    """Push overlapping nodes apart by nudging their angles within their hop ring."""
    by_depth: dict[int, list[str]] = {}
    for ieee, depth in depth_map.items():
        if depth > 0:
            by_depth.setdefault(depth, []).append(ieee)

    ring_r: dict[str, float] = {
        ieee: (ring_radii.get(depth - 1, 0.0) + ring_radii.get(depth, depth * MIN_RING_GAP)) / 2
        for ieee, depth in depth_map.items()
        if depth > 0
    }

    for _ in range(COLLISION_ITERS):
        moved = False
        for depth_nodes in by_depth.values():
            n = len(depth_nodes)
            for i in range(n):
                a = depth_nodes[i]
                for j in range(i + 1, n):
                    b = depth_nodes[j]
                    ax, ay = positions[a]
                    bx, by_ = positions[b]
                    dist = math.hypot(ax - bx, ay - by_)
                    ra = _node_radius(nodes[a].get("type", "EndDevice"))
                    rb = _node_radius(nodes[b].get("type", "EndDevice"))
                    min_dist = max(ra + rb + COLLISION_GAP, LABEL_ARC)
                    if dist >= min_dist:
                        continue
                    moved = True
                    r = (ring_r[a] + ring_r[b]) / 2
                    angular_overlap = (min_dist - dist) / max(r, 1.0)
                    diff = (angles[b] - angles[a] + math.pi) % (2 * math.pi) - math.pi
                    nudge = angular_overlap / 2
                    if diff >= 0:
                        angles[a] -= nudge
                        angles[b] += nudge
                    else:
                        angles[a] += nudge
                        angles[b] -= nudge
                    rra, rrb = ring_r[a], ring_r[b]
                    positions[a] = (cx + rra * math.sin(angles[a]), cy - rra * math.cos(angles[a]))
                    positions[b] = (cx + rrb * math.sin(angles[b]), cy - rrb * math.cos(angles[b]))
        if not moved:
            break


# ── SVG drawing helpers ───────────────────────────────────────────────────────


def _label_anchor(angle: float) -> str:
    """Text anchor based on which half of the circle the node is on."""
    x_component = math.sin(angle)
    if abs(x_component) < 0.25:
        return "middle"
    return "start" if x_component > 0 else "end"


def _add_defs_filters(defs: ET.Element) -> None:
    """Inject glow filters for WEAK and CRITICAL nodes into <defs>."""
    for fid, color, std_dev in [
        ("glow-warn", EDGE_WARN, "6"),
        ("glow-crit", EDGE_CRIT, "8"),
    ]:
        f = ET.SubElement(
            defs, "filter", {"id": fid, "x": "-60%", "y": "-60%", "width": "220%", "height": "220%"}
        )
        ET.SubElement(
            f, "feGaussianBlur", {"in": "SourceAlpha", "stdDeviation": std_dev, "result": "blur"}
        )
        ET.SubElement(
            f, "feFlood", {"flood-color": color, "flood-opacity": "0.85", "result": "flood"}
        )
        ET.SubElement(
            f, "feComposite", {"in": "flood", "in2": "blur", "operator": "in", "result": "glow"}
        )
        merge = ET.SubElement(f, "feMerge")
        ET.SubElement(merge, "feMergeNode", {"in": "glow"})
        ET.SubElement(merge, "feMergeNode", {"in": "SourceGraphic"})


def _draw_node(
    svg: ET.Element,
    node_group: ET.Element,
    label_group: ET.Element,
    ieee: str,
    x: float,
    y: float,
    angle: float,
    node: dict[str, Any],
    depth: int,
    path_lqi: int,
    coord_lqi: int | None,
    lqi: int,
    warn_lqi: int,
    critical_lqi: int,
) -> None:
    """Draw a single node: circle + glow + LQI badge + label pill + label text."""
    node_type = node.get("type", "EndDevice")
    name = node.get("friendlyName", ieee)
    fill = _node_fill(node_type)
    nr = _node_radius(node_type)
    is_coord = node_type == "Coordinator"

    # Status ring + glow filter on problem nodes
    stroke_color = fill
    stroke_w = 0
    glow_filter: str | None = None
    if not is_coord:
        if lqi < critical_lqi:
            stroke_color = EDGE_CRIT
            stroke_w = 3
            glow_filter = "url(#glow-crit)"
        elif lqi < warn_lqi:
            stroke_color = EDGE_WARN
            stroke_w = 2
            glow_filter = "url(#glow-warn)"

    circle_attrs: dict[str, str] = {
        "cx": str(round(x, 1)),
        "cy": str(round(y, 1)),
        "r": str(nr),
        "fill": fill,
        "stroke": stroke_color,
        "stroke-width": str(stroke_w),
    }
    if glow_filter:
        circle_attrs["filter"] = glow_filter
    ET.SubElement(node_group, "circle", circle_attrs)

    # LQI badge inside non-coordinator nodes
    if not is_coord:
        badge_lqi = coord_lqi if (depth == 1 and coord_lqi is not None) else path_lqi
        lqi_color = _edge_color(badge_lqi, warn_lqi, critical_lqi)
        is_router = node_type == "Router"
        badge_fs = "9px" if is_router else "8px"
        char_w = 6 if is_router else 5
        badge_h = 11 if is_router else 10
        badge_w = len(str(badge_lqi)) * char_w + 8
        ET.SubElement(
            node_group,
            "rect",
            {
                "x": str(round(x - badge_w / 2, 1)),
                "y": str(round(y - badge_h / 2, 1)),
                "width": str(badge_w),
                "height": str(badge_h),
                "rx": "3",
                "fill": "#0f172a",
                "opacity": "0.82",
            },
        )
        txt = ET.SubElement(
            node_group,
            "text",
            {
                "x": str(round(x, 1)),
                "y": str(round(y + badge_h * 0.3, 1)),
                "fill": lqi_color,
                "font-size": badge_fs,
                "font-weight": "bold",
                "text-anchor": "middle",
            },
        )
        txt.text = str(badge_lqi)

    # Label: radially offset outward from center
    if is_coord:
        lx, ly_label = x, y + nr + 16
        anchor = "middle"
    else:
        offset = nr + 14
        lx = x + math.sin(angle) * offset
        ly_label = y - math.cos(angle) * offset
        anchor = _label_anchor(angle)

    # Pill background behind name
    display_name = (name[: MAX_LABEL_LEN - 1] + "…") if len(name) > MAX_LABEL_LEN else name
    pill_h = 16
    pill_w = len(display_name) * 6 + 10
    if anchor == "start":
        pill_x = lx - 4
    elif anchor == "end":
        pill_x = lx - pill_w + 4
    else:
        pill_x = lx - pill_w / 2
    pill_y = ly_label - 13
    ET.SubElement(
        label_group,
        "rect",
        {
            "x": str(round(pill_x, 1)),
            "y": str(round(pill_y, 1)),
            "width": str(pill_w),
            "height": str(pill_h),
            "rx": "5",
            "fill": "black",
            "opacity": "0.6",
        },
    )

    lbl = ET.SubElement(
        label_group,
        "text",
        {
            "x": str(round(lx, 1)),
            "y": str(round(ly_label, 1)),
            "fill": TEXT_PRIMARY,
            "font-size": LABEL_FS,
            "text-anchor": anchor,
            "stroke": "black",
            "stroke-width": "3",
            "stroke-opacity": "0.5",
            "paint-order": "stroke",
        },
    )
    lbl.text = display_name
    if display_name != name:
        title_el = ET.SubElement(lbl, "title")
        title_el.text = name


# ── Layout orchestration ─────────────────────────────────────────────────────


@dataclass
class LayoutResult:
    """Computed geometry for every node in the network."""

    positions: dict[str, tuple[float, float]]
    angles: dict[str, float]
    ring_radii: dict[int, float]
    path_min_lqi: dict[str, int]
    canvas: int
    cx: float
    cy: float
    max_hops: int
    coordinator_ieee: str


def _compute_layout(
    nodes: dict[str, dict[str, Any]],
    parent_map: dict[str, str | None],
    lqi_map: dict[str, int],
    depth_map: dict[str, int],
    children: dict[str, list[str]],
) -> LayoutResult | None:
    """Run the full radial layout pipeline and return geometry, or None if no coordinator."""
    bad_keys = {k for k in parent_map if k not in nodes}
    if bad_keys:
        raise ValueError(f"parent_map contains IEEEs not in nodes: {bad_keys}")
    bad_parents = {v for v in parent_map.values() if v is not None and v not in nodes}
    if bad_parents:
        raise ValueError(f"parent_map references parent IEEEs not in nodes: {bad_parents}")

    coordinator_ieee = next(
        (ieee for ieee, n in nodes.items() if n.get("type") == "Coordinator"), None
    )
    if coordinator_ieee is None:
        return None

    max_hops = max(depth_map.values(), default=1)
    ring_radii = _compute_ring_radii(depth_map, nodes)
    half = max(ring_radii.values()) + LABEL_MARGIN
    canvas = int(half * 2)
    cx, cy = half, half

    leaf_counts = _subtree_weights(coordinator_ieee, children)
    angles: dict[str, float] = {}
    _assign_angles(
        coordinator_ieee,
        children,
        leaf_counts,
        angles,
        0.0,
        2 * math.pi,
        depth_map,
        nodes,
        ring_radii,
    )
    path_min_lqi = _compute_path_min_lqi(parent_map, lqi_map)

    positions: dict[str, tuple[float, float]] = {}
    for ieee, angle in angles.items():
        depth = depth_map.get(ieee, 0)
        if depth > 0:
            prev_r = ring_radii.get(depth - 1, 0.0)
            curr_r = ring_radii.get(depth, depth * MIN_RING_GAP)
            r = (prev_r + curr_r) / 2
        else:
            r = 0.0
        positions[ieee] = (cx + r * math.sin(angle), cy - r * math.cos(angle))

    _resolve_collisions(positions, angles, depth_map, nodes, cx, cy, ring_radii)

    return LayoutResult(
        positions=positions,
        angles=angles,
        ring_radii=ring_radii,
        path_min_lqi=path_min_lqi,
        canvas=canvas,
        cx=cx,
        cy=cy,
        max_hops=max_hops,
        coordinator_ieee=coordinator_ieee,
    )


# ── Public entry point ────────────────────────────────────────────────────────


def render_svg(
    nodes: dict[str, dict[str, Any]],
    parent_map: dict[str, str | None],
    lqi_map: dict[str, int],
    depth_map: dict[str, int],
    warn_lqi: int = 50,
    critical_lqi: int = 20,
) -> str:
    """Render a radial Zigbee network map as an SVG XML string."""
    if not nodes:
        empty = ET.Element(
            "svg", {"xmlns": "http://www.w3.org/2000/svg", "width": "400", "height": "200"}
        )
        t = ET.SubElement(
            empty, "text", {"x": "200", "y": "100", "text-anchor": "middle", "fill": TEXT_PRIMARY}
        )
        t.text = "No devices found"
        return ET.tostring(empty, encoding="unicode")

    # Build children map from parent_map
    children: dict[str, list[str]] = {}
    for ieee, parent_ieee in parent_map.items():
        if parent_ieee is not None:
            children.setdefault(parent_ieee, []).append(ieee)

    layout = _compute_layout(nodes, parent_map, lqi_map, depth_map, children)
    if layout is None:
        empty = ET.Element(
            "svg", {"xmlns": "http://www.w3.org/2000/svg", "width": "400", "height": "200"}
        )
        t = ET.SubElement(
            empty, "text", {"x": "200", "y": "100", "text-anchor": "middle", "fill": TEXT_PRIMARY}
        )
        t.text = "No devices found"
        return ET.tostring(empty, encoding="unicode")

    positions = layout.positions
    angles = layout.angles
    ring_radii = layout.ring_radii
    path_min_lqi = layout.path_min_lqi
    cx, cy = layout.cx, layout.cy
    max_hops = layout.max_hops

    # ── Compute viewBox encompassing the outermost ring circle ──────────────
    outer_r = ring_radii[max_hops] + LABEL_MARGIN
    vb_x1 = cx - outer_r
    vb_y1 = cy - outer_r
    vb_w = 2 * outer_r
    vb_h = 2 * outer_r

    # ── Drawing ───────────────────────────────────────────────────────────────
    svg = ET.Element(
        "svg",
        {
            "xmlns": "http://www.w3.org/2000/svg",
            "viewBox": f"{vb_x1} {vb_y1} {vb_w} {vb_h}",
            "width": str(int(vb_w)),
            "height": str(int(vb_h)),
            "font-family": "system-ui, -apple-system, sans-serif",
        },
    )

    # Defs: filters
    defs = ET.SubElement(svg, "defs")
    _add_defs_filters(defs)

    # Ring band fills (donut paths, color-coded by hop)
    ring_fill_group = ET.SubElement(svg, "g", {"id": "ring-fills"})
    for h in range(1, max_hops + 1):
        r_inner = ring_radii.get(h - 1, 0.0) if h > 1 else 0.0
        r_outer = ring_radii[h]
        hop_color = HOP_COLORS[(h - 1) % len(HOP_COLORS)]
        ET.SubElement(
            ring_fill_group,
            "path",
            {
                "d": _annulus_path(cx, cy, r_inner, r_outer),
                "fill": hop_color,
                "fill-opacity": "0.80",
                "fill-rule": "evenodd",
                "stroke": "none",
            },
        )

    # Ring guides
    ring_group = ET.SubElement(svg, "g", {"id": "rings"})
    for h in range(1, max_hops + 1):
        ring_label_c = HOP_COLORS[(h - 1) % len(HOP_COLORS)]
        ring_r = ring_radii[h]
        ET.SubElement(
            ring_group,
            "circle",
            {
                "cx": str(cx),
                "cy": str(cy),
                "r": str(round(ring_r, 1)),
                "fill": "none",
                "stroke": ring_label_c,
                "stroke-opacity": "0.3",
                "stroke-width": "1",
                "stroke-dasharray": "5,4",
            },
        )
        txt = ET.SubElement(
            ring_group,
            "text",
            {
                "x": str(cx),
                "y": str(round(cy - ring_r + 14, 1)),
                "fill": TEXT_PRIMARY,
                "font-size": "16px",
                "text-anchor": "middle",
                "font-weight": "bold",
                "letter-spacing": "0.5",
                "stroke": "black",
                "stroke-width": "3",
                "stroke-opacity": "0.6",
                "paint-order": "stroke",
            },
        )
        txt.text = f"Hop {h}"

    # Edges + LQI pill badges
    edge_group = ET.SubElement(svg, "g", {"id": "edges", "opacity": str(EDGE_OPACITY)})
    lqi_label_group = ET.SubElement(svg, "g", {"id": "lqi-labels"})
    for ieee, parent_ieee in parent_map.items():
        if parent_ieee is None:
            continue
        if ieee not in positions or parent_ieee not in positions:
            continue
        x1, y1 = positions[ieee]
        x2, y2 = positions[parent_ieee]
        lqi = lqi_map.get(ieee, 0)
        color = _edge_color(lqi, warn_lqi, critical_lqi)
        ET.SubElement(
            edge_group,
            "line",
            {
                "x1": str(round(x1, 1)),
                "y1": str(round(y1, 1)),
                "x2": str(round(x2, 1)),
                "y2": str(round(y2, 1)),
                "stroke": color,
                "stroke-width": str(_edge_width(lqi)),
            },
        )
        # LQI label on edge
        lqi_text = f"LQI: {lqi}"
        mx = x1 + 0.35 * (x2 - x1)
        my = y1 + 0.35 * (y2 - y1)
        badge_w = len(lqi_text) * 7 + 10
        ET.SubElement(
            lqi_label_group,
            "rect",
            {
                "x": str(round(mx - badge_w / 2, 1)),
                "y": str(round(my - 9, 1)),
                "width": str(badge_w),
                "height": "13",
                "rx": "4",
                "fill": "#0f172a",
                "opacity": "0.85",
            },
        )
        txt = ET.SubElement(
            lqi_label_group,
            "text",
            {
                "x": str(round(mx, 1)),
                "y": str(round(my + 1, 1)),
                "fill": color,
                "font-size": DIM_FS,
                "text-anchor": "middle",
                "opacity": "0.95",
            },
        )
        txt.text = lqi_text

    # Nodes + labels
    node_group = ET.SubElement(svg, "g", {"id": "nodes"})
    label_group = ET.SubElement(svg, "g", {"id": "labels"})

    for ieee, (x, y) in positions.items():
        node = nodes[ieee]
        depth = depth_map.get(ieee, 0)
        path_lqi_val = path_min_lqi.get(ieee, 0)
        coord_lqi = None  # coord_lqi_map not passed in HACS version
        angle = angles.get(ieee, 0.0)
        _draw_node(
            svg,
            node_group,
            label_group,
            ieee,
            x,
            y,
            angle,
            node,
            depth,
            path_lqi_val,
            coord_lqi,
            lqi_map.get(ieee, 0),
            warn_lqi,
            critical_lqi,
        )

    return ET.tostring(svg, encoding="unicode")
