"""Graph algorithms for Zigbee network topology — ported from zigporter CLI."""

from typing import Any

from .const import COORDINATOR_BONUS

HOP_LQI_PENALTY = 10


def normalize_ieee(ieee: str) -> str:
    """Normalize IEEE address to lowercase hex without separators."""
    return ieee.replace(":", "").replace("-", "").lower()


def _zha_lqi(raw: str | int | None) -> int:
    """Convert a ZHA LQI value to int, handling string serialization."""
    if raw is None:
        return 0
    try:
        return int(raw)
    except (ValueError, TypeError):
        return 0


def build_zha_topology_from_devices(
    zha_devices: list[dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    """Build routing topology from ZHA neighbor tables."""
    nodes: dict[str, dict[str, Any]] = {}
    links: list[dict[str, Any]] = []
    device_lqi: dict[str, int] = {}
    coordinator_ieee: str | None = None

    # First pass: build nodes and device-level LQI map
    for dev in zha_devices:
        raw_ieee = dev.get("ieee", "")
        if not raw_ieee:
            continue
        ieee = normalize_ieee(raw_ieee)
        name = dev.get("user_given_name") or dev.get("name") or raw_ieee
        device_type = dev.get("device_type") or "EndDevice"
        node_data: dict[str, Any] = {"ieeeAddr": ieee, "friendlyName": name, "type": device_type}
        if dev.get("last_seen"):
            node_data["last_seen"] = dev["last_seen"]
        nodes[ieee] = node_data
        device_lqi[ieee] = _zha_lqi(dev.get("lqi"))
        if device_type == "Coordinator":
            coordinator_ieee = ieee

    # Second pass: build links from neighbor tables
    for dev in zha_devices:
        raw_ieee = dev.get("ieee", "")
        if not raw_ieee:
            continue
        ieee = normalize_ieee(raw_ieee)
        for neighbor in dev.get("neighbors", []):
            n_raw_ieee = neighbor.get("ieee", "")
            if not n_raw_ieee:
                continue
            n_ieee = normalize_ieee(n_raw_ieee)
            lqi = _zha_lqi(neighbor.get("lqi"))
            if lqi == 0:
                lqi = device_lqi.get(n_ieee, 0)
            relationship = neighbor.get("relationship", "")
            links.append(
                {
                    "source": {"ieeeAddr": n_ieee},
                    "target": {"ieeeAddr": ieee},
                    "lqi": lqi,
                    "relationship": relationship,
                }
            )

    # Inject synthetic links for orphaned devices using device-level LQI.
    # End devices often don't appear in any router's neighbor table (sleepy),
    # but ZHA tracks their last-heard LQI on the device object.
    if coordinator_ieee:
        linked: set[str] = set()
        for link in links:
            linked.add(link["source"]["ieeeAddr"].lower())
            linked.add(link["target"]["ieeeAddr"].lower())
        for ieee, node in nodes.items():
            if ieee == coordinator_ieee or ieee in linked:
                continue
            lqi = device_lqi.get(ieee, 0)
            if lqi > 0:
                links.append(
                    {
                        "source": {"ieeeAddr": ieee},
                        "target": {"ieeeAddr": coordinator_ieee},
                        "lqi": lqi,
                        "relationship": "Child",
                    }
                )

    return nodes, links


def build_flat_zha_topology(
    zha_devices: list[dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    """Build a flat single-hop topology when no neighbor data is available."""
    coordinator_ieee: str | None = None
    for dev in zha_devices:
        if dev.get("device_type") == "Coordinator":
            ieee = normalize_ieee(dev.get("ieee", ""))
            if ieee:
                coordinator_ieee = ieee
                break

    nodes: dict[str, dict[str, Any]] = {}
    links: list[dict[str, Any]] = []

    for dev in zha_devices:
        raw_ieee = dev.get("ieee", "")
        if not raw_ieee:
            continue
        ieee = normalize_ieee(raw_ieee)
        name = dev.get("user_given_name") or dev.get("name") or raw_ieee
        device_type = dev.get("device_type") or "EndDevice"
        nodes[ieee] = {"ieeeAddr": ieee, "friendlyName": name, "type": device_type}

        if coordinator_ieee and ieee != coordinator_ieee:
            lqi = dev.get("lqi") or 0
            links.append(
                {
                    "source": {"ieeeAddr": ieee},
                    "target": {"ieeeAddr": coordinator_ieee},
                    "lqi": lqi,
                }
            )

    return nodes, links


def _is_ancestor(candidate: str, of: str, parent_map: dict[str, str | None]) -> bool:
    """Return True if candidate is an ancestor of `of` in the current tree."""
    cur = parent_map.get(of)
    while cur is not None:
        if cur == candidate:
            return True
        cur = parent_map.get(cur)
    return False


def build_routing_tree(
    nodes: dict[str, dict[str, Any]],
    links: list[dict[str, Any]],
) -> tuple[dict[str, str | None], dict[str, int], dict[str, int]]:
    """Build a routing tree via iterative greedy BFS.

    Returns:
        parent_map:  ieee -> parent_ieee (None for coordinator)
        lqi_map:     ieee -> min(lqi_out, lqi_in) to parent
        depth_map:   ieee -> hops from coordinator
    """
    pair_lqi: dict[tuple[str, str], int] = {}
    outgoing: dict[str, list[tuple[str, int, str | int]]] = {}
    for link in links:
        src = link["source"]["ieeeAddr"].lower()
        tgt = link["target"]["ieeeAddr"].lower()
        lqi = link.get("lqi", 0)
        relationship = link.get("relationship", "")
        pair_lqi[(src, tgt)] = lqi
        outgoing.setdefault(src, []).append((tgt, lqi, relationship))

    coordinator_ieee: str | None = None
    for ieee, node in nodes.items():
        if node.get("type") == "Coordinator":
            coordinator_ieee = ieee
            break

    if coordinator_ieee is None:
        return {}, {}, {}

    parent_map: dict[str, str | None] = {coordinator_ieee: None}
    lqi_map: dict[str, int] = {}
    depth_map: dict[str, int] = {coordinator_ieee: 0}
    visited: set[str] = {coordinator_ieee}
    best_score_map: dict[str, tuple[int, int]] = {}

    changed = True
    while changed:
        changed = False
        for ieee, node_data in nodes.items():
            if node_data.get("type") == "Coordinator":
                continue
            best_parent: str | None = None
            best_score: tuple[int, int] = (-1, -1)
            best_real_lqi = 0
            for tgt, lqi_out, relationship in outgoing.get(ieee, []):
                if tgt not in visited:
                    continue
                if relationship in ("Parent", "PreviousChild"):
                    continue
                lqi_in = pair_lqi.get((tgt, ieee), lqi_out)
                effective_lqi = min(lqi_out, lqi_in)
                is_child = 1 if relationship in ("Child", 1) else 0
                candidate_depth = depth_map[tgt]
                coord_bonus = COORDINATOR_BONUS if tgt == coordinator_ieee else 0
                score = (is_child, effective_lqi - HOP_LQI_PENALTY * candidate_depth + coord_bonus)
                if _is_ancestor(ieee, tgt, parent_map):
                    continue
                if score > best_score:
                    best_score = score
                    best_parent = tgt
                    best_real_lqi = effective_lqi
            if best_parent is not None and best_score > best_score_map.get(ieee, (-1, -1)):
                best_score_map[ieee] = best_score
                parent_map[ieee] = best_parent
                lqi_map[ieee] = best_real_lqi
                depth_map[ieee] = depth_map[best_parent] + 1
                visited.add(ieee)
                changed = True

    for ieee in nodes:
        if ieee not in visited:
            parent_map[ieee] = coordinator_ieee
            lqi_map[ieee] = 0
            depth_map[ieee] = 1

    cascade_changed = True
    while cascade_changed:
        cascade_changed = False
        for ieee in nodes:
            p = parent_map.get(ieee)
            if p is not None:
                new_depth = depth_map.get(p, 0) + 1
                if depth_map.get(ieee) != new_depth:
                    depth_map[ieee] = new_depth  # pragma: no cover
                    cascade_changed = True  # pragma: no cover

    return parent_map, lqi_map, depth_map
