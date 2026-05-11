"""SVG renderer for Zigbee network map — uses xml.etree.ElementTree (no svgwrite)."""

import math
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Any

# Visual constants (match CLI output)
MIN_RING_GAP = 200
ANGULAR_PADDING = 50
LABEL_OFFSET = 30
LABEL_MARGIN = 340

HOP_COLORS = [
    "#facc15",  # yellow (hop 1)
    "#4ade80",  # green (hop 2)
    "#60a5fa",  # blue (hop 3)
    "#f472b6",  # pink (hop 4)
    "#fb923c",  # orange (hop 5)
    "#a78bfa",  # violet (hop 6)
]

NODE_R_COORD = 28
NODE_R_ROUTER = 20
NODE_R_END = 14

BG = "#0f172a"
COORD_FILL = "#f59e0b"
ROUTER_FILL = "#0ea5e9"
END_FILL = "#475569"

TEXT_PRIMARY = "#e2e8f0"
TEXT_DIM = "#64748b"

EDGE_GOOD = "#22c55e"
EDGE_WARN = "#f59e0b"
EDGE_CRIT = "#ef4444"
EDGE_OPACITY = 0.55

LABEL_FS = "11px"
COLLISION_GAP = 100
COLLISION_ITERS = 200

MAX_LABEL_LEN = 22
LABEL_ARC = MAX_LABEL_LEN * 6 + 10


@dataclass
class NodePosition:
    """Computed position for a node in the radial layout."""

    ieee: str
    x: float
    y: float
    radius: float
    depth: int
    name: str
    node_type: str


def _edge_color(lqi: int, warn: int, crit: int) -> str:
    if lqi < crit:
        return EDGE_CRIT
    if lqi < warn:
        return EDGE_WARN
    return EDGE_GOOD


def _node_radius(node_type: str) -> int:
    if node_type == "Coordinator":
        return NODE_R_COORD
    if node_type == "Router":
        return NODE_R_ROUTER
    return NODE_R_END


def _node_fill(node_type: str) -> str:
    if node_type == "Coordinator":
        return COORD_FILL
    if node_type == "Router":
        return ROUTER_FILL
    return END_FILL


def _compute_ring_radii(depth_counts: dict[int, int]) -> list[float]:
    """Compute ring boundary radii based on node counts per depth."""
    if not depth_counts:
        return []
    max_depth = max(depth_counts.keys())
    radii: list[float] = [0.0]

    for d in range(1, max_depth + 1):
        n = depth_counts.get(d, 1)
        arc_per_device = max(NODE_R_ROUTER * 2, LABEL_ARC) + ANGULAR_PADDING
        required_r = n * arc_per_device / (2 * math.pi)
        prev_r = radii[-1]
        node_r = max(required_r, prev_r + MIN_RING_GAP / 2)
        ring_r = max(2 * node_r - prev_r + LABEL_OFFSET, prev_r + MIN_RING_GAP)
        radii.append(ring_r)

    return radii


def _assign_angles(
    nodes_at_depth: list[str],
    parent_map: dict[str, str | None],
    parent_angles: dict[str, float],
) -> dict[str, float]:
    """Assign angular positions to nodes, grouping children near parents."""
    if not nodes_at_depth:
        return {}

    n = len(nodes_at_depth)
    angle_step = 2 * math.pi / n
    angles: dict[str, float] = {}

    sorted_nodes = sorted(
        nodes_at_depth,
        key=lambda ieee: parent_angles.get(parent_map.get(ieee, "") or "", 0),
    )

    for i, ieee in enumerate(sorted_nodes):
        angles[ieee] = i * angle_step

    return angles


def _compute_layout(
    nodes: dict[str, dict[str, Any]],
    parent_map: dict[str, str | None],
    depth_map: dict[str, int],
) -> list[NodePosition]:
    """Compute positions for all nodes in a radial layout."""
    if not nodes:
        return []

    depth_counts: dict[int, int] = {}
    for ieee, depth in depth_map.items():
        if depth > 0:
            depth_counts[depth] = depth_counts.get(depth, 0) + 1

    ring_radii = _compute_ring_radii(depth_counts)

    nodes_by_depth: dict[int, list[str]] = {}
    for ieee, depth in depth_map.items():
        nodes_by_depth.setdefault(depth, []).append(ieee)

    positions: list[NodePosition] = []
    parent_angles: dict[str, float] = {}

    # Coordinator at center
    for ieee in nodes_by_depth.get(0, []):
        node = nodes[ieee]
        name = node.get("friendlyName", ieee)
        positions.append(
            NodePosition(
                ieee=ieee,
                x=0,
                y=0,
                radius=NODE_R_COORD,
                depth=0,
                name=name,
                node_type="Coordinator",
            )
        )
        parent_angles[ieee] = 0

    max_depth = max(depth_map.values()) if depth_map else 0
    for depth in range(1, max_depth + 1):
        depth_nodes = nodes_by_depth.get(depth, [])
        if not depth_nodes:
            continue

        angles = _assign_angles(depth_nodes, parent_map, parent_angles)
        ring_r = ring_radii[depth] if depth < len(ring_radii) else ring_radii[-1] + MIN_RING_GAP

        for ieee in depth_nodes:
            angle = angles.get(ieee, 0)
            node = nodes[ieee]
            name = node.get("friendlyName", ieee)
            node_type = node.get("type", "EndDevice")
            nr = _node_radius(node_type)
            x = ring_r * math.cos(angle)
            y = ring_r * math.sin(angle)
            positions.append(
                NodePosition(
                    ieee=ieee, x=x, y=y, radius=nr, depth=depth, name=name, node_type=node_type
                )
            )
            parent_angles[ieee] = angle

    return positions


def render_svg(
    nodes: dict[str, dict[str, Any]],
    parent_map: dict[str, str | None],
    lqi_map: dict[str, int],
    depth_map: dict[str, int],
    warn_lqi: int = 50,
    critical_lqi: int = 20,
) -> str:
    """Render the network map as an SVG string."""
    positions = _compute_layout(nodes, parent_map, depth_map)

    if not positions:
        empty = ET.Element(
            "svg",
            {
                "xmlns": "http://www.w3.org/2000/svg",
                "width": "400",
                "height": "200",
            },
        )
        t = ET.SubElement(
            empty,
            "text",
            {
                "x": "200",
                "y": "100",
                "text-anchor": "middle",
                "fill": TEXT_PRIMARY,
            },
        )
        t.text = "No devices found"
        return ET.tostring(empty, encoding="unicode")

    pos_map = {p.ieee: p for p in positions}

    all_x = [p.x for p in positions]
    all_y = [p.y for p in positions]
    margin = LABEL_MARGIN
    min_x = min(all_x) - margin
    max_x = max(all_x) + margin
    min_y = min(all_y) - margin
    max_y = max(all_y) + margin
    width = max_x - min_x
    height = max_y - min_y

    svg = ET.Element(
        "svg",
        {
            "xmlns": "http://www.w3.org/2000/svg",
            "width": str(int(width)),
            "height": str(int(height)),
            "viewBox": f"{min_x} {min_y} {width} {height}",
        },
    )

    # Background
    ET.SubElement(
        svg,
        "rect",
        {
            "x": str(min_x),
            "y": str(min_y),
            "width": str(width),
            "height": str(height),
            "fill": BG,
        },
    )

    # Ring guides
    depth_counts: dict[int, int] = {}
    for d in depth_map.values():
        if d > 0:
            depth_counts[d] = depth_counts.get(d, 0) + 1
    ring_radii = _compute_ring_radii(depth_counts)
    for i, r in enumerate(ring_radii[1:], 1):
        color = HOP_COLORS[(i - 1) % len(HOP_COLORS)]
        ET.SubElement(
            svg,
            "circle",
            {
                "cx": "0",
                "cy": "0",
                "r": str(int(r)),
                "fill": "none",
                "stroke": color,
                "stroke-width": "1",
                "stroke-opacity": "0.2",
            },
        )

    # Edges
    for ieee, parent_ieee in parent_map.items():
        if parent_ieee is None:
            continue
        if ieee not in pos_map or parent_ieee not in pos_map:
            continue
        p1 = pos_map[ieee]
        p2 = pos_map[parent_ieee]
        lqi = lqi_map.get(ieee, 0)
        color = _edge_color(lqi, warn_lqi, critical_lqi)
        ET.SubElement(
            svg,
            "line",
            {
                "x1": str(p1.x),
                "y1": str(p1.y),
                "x2": str(p2.x),
                "y2": str(p2.y),
                "stroke": color,
                "stroke-width": "2",
                "stroke-opacity": str(EDGE_OPACITY),
            },
        )

    # Nodes
    for pos in positions:
        fill = _node_fill(pos.node_type)
        g = ET.SubElement(svg, "g")

        ET.SubElement(
            g,
            "circle",
            {
                "cx": str(pos.x),
                "cy": str(pos.y),
                "r": str(pos.radius),
                "fill": fill,
            },
        )

        title = ET.SubElement(g, "title")
        title.text = pos.name

        label = pos.name[:MAX_LABEL_LEN]
        text = ET.SubElement(
            g,
            "text",
            {
                "x": str(pos.x),
                "y": str(pos.y + pos.radius + 16),
                "text-anchor": "middle",
                "fill": TEXT_PRIMARY,
                "font-size": LABEL_FS,
                "font-family": "sans-serif",
            },
        )
        text.text = label

        if pos.depth > 0:
            lqi = lqi_map.get(pos.ieee, 0)
            lqi_text = ET.SubElement(
                g,
                "text",
                {
                    "x": str(pos.x),
                    "y": str(pos.y + pos.radius + 30),
                    "text-anchor": "middle",
                    "fill": _edge_color(lqi, warn_lqi, critical_lqi),
                    "font-size": LABEL_FS,
                    "font-family": "sans-serif",
                },
            )
            lqi_text.text = f"LQI: {lqi}"

    return ET.tostring(svg, encoding="unicode")
