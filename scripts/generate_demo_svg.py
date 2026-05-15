"""Generate a demo SVG with realistic dummy Zigbee network data."""

import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from custom_components.zigporter.network_map import build_routing_tree
from custom_components.zigporter.network_map_svg import render_svg

SEED = 42

DEVICE_NAMES = {
    "routers": [
        "Living Room Lamp",
        "Kitchen Light",
        "Hallway Plug",
        "Office Desk Light",
        "Bedroom Ceiling",
        "Bathroom Fan",
        "Garage Door Sensor",
        "Dining Table Light",
        "Patio String Lights",
        "Stairway Light",
        "Laundry Plug",
        "Guest Room Lamp",
    ],
    "end_devices": [
        "Front Door Contact",
        "Back Door Contact",
        "Motion Hallway",
        "Motion Kitchen",
        "Motion Bathroom",
        "Temp Living Room",
        "Temp Bedroom",
        "Temp Office",
        "Humidity Bathroom",
        "Window Sensor Left",
        "Window Sensor Right",
        "Blinds Living Room",
        "Blinds Bedroom",
        "Button Bedside",
        "Button Kitchen",
        "Leak Sensor Kitchen",
        "Leak Sensor Bathroom",
        "Smoke Detector Hall",
        "Vibration Sensor",
        "Light Sensor Garden",
    ],
}


def _fake_ieee(index: int) -> str:
    return f"00158d0000{index:06x}"


def generate_dummy_network(
    n_routers: int = 12, n_end_devices: int = 20, seed: int = SEED
) -> tuple[dict, list]:
    rng = random.Random(seed)

    nodes = {}
    links = []

    coord_ieee = _fake_ieee(0)
    nodes[coord_ieee] = {
        "ieeeAddr": coord_ieee,
        "friendlyName": "Coordinator",
        "type": "Coordinator",
    }

    router_ieees = []
    for i in range(n_routers):
        ieee = _fake_ieee(i + 1)
        name = DEVICE_NAMES["routers"][i % len(DEVICE_NAMES["routers"])]
        nodes[ieee] = {"ieeeAddr": ieee, "friendlyName": name, "type": "Router"}
        router_ieees.append(ieee)

    end_ieees = []
    for i in range(n_end_devices):
        ieee = _fake_ieee(100 + i)
        name = DEVICE_NAMES["end_devices"][i % len(DEVICE_NAMES["end_devices"])]
        nodes[ieee] = {"ieeeAddr": ieee, "friendlyName": name, "type": "EndDevice"}
        end_ieees.append(ieee)

    # Connect routers: first few directly to coordinator, rest to other routers
    for i, r_ieee in enumerate(router_ieees):
        if i < 4:
            parent = coord_ieee
            lqi = rng.randint(180, 255)
        else:
            parent = rng.choice(router_ieees[:i])
            lqi = rng.randint(80, 220)
        links.append({"source": {"ieeeAddr": r_ieee}, "target": {"ieeeAddr": parent}, "lqi": lqi})
        reverse_lqi = lqi + rng.randint(-15, 15)
        links.append(
            {"source": {"ieeeAddr": parent}, "target": {"ieeeAddr": r_ieee}, "lqi": reverse_lqi}
        )

    # Connect end devices to routers (or occasionally coordinator)
    for e_ieee in end_ieees:
        if rng.random() < 0.1:
            parent = coord_ieee
        else:
            parent = rng.choice(router_ieees)
        lqi = rng.randint(40, 255)
        links.append({"source": {"ieeeAddr": e_ieee}, "target": {"ieeeAddr": parent}, "lqi": lqi})
        reverse_lqi = lqi + rng.randint(-10, 10)
        links.append(
            {"source": {"ieeeAddr": parent}, "target": {"ieeeAddr": e_ieee}, "lqi": reverse_lqi}
        )

    # Add some cross-links between routers for realism
    for _ in range(5):
        a, b = rng.sample(router_ieees, 2)
        lqi = rng.randint(60, 200)
        links.append({"source": {"ieeeAddr": a}, "target": {"ieeeAddr": b}, "lqi": lqi})

    return nodes, links


def main():
    nodes, links = generate_dummy_network()
    parent_map, lqi_map, depth_map = build_routing_tree(nodes, links)

    svg = render_svg(
        nodes=nodes,
        parent_map=parent_map,
        lqi_map=lqi_map,
        depth_map=depth_map,
        warn_lqi=50,
        critical_lqi=20,
    )

    out_path = Path(__file__).resolve().parents[1] / "docs" / "assets" / "demo-network.svg"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(svg)
    print(f"Generated: {out_path} ({len(nodes)} devices, {max(depth_map.values())} hops)")


if __name__ == "__main__":
    main()
