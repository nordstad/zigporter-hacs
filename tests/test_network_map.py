"""Tests for network_map graph algorithms."""

from custom_components.zigporter.network_map import (
    _zha_lqi,
    build_flat_zha_topology,
    build_routing_tree,
    build_zha_topology_from_devices,
    normalize_ieee,
)


class TestNormalizeIeee:
    def test_colon_format(self):
        assert normalize_ieee("00:12:4b:00:01:ab:cd:ef") == "00124b0001abcdef"

    def test_dash_format(self):
        assert normalize_ieee("00-12-4B-00-01-AB-CD-EF") == "00124b0001abcdef"

    def test_already_normalized(self):
        assert normalize_ieee("00124b0001abcdef") == "00124b0001abcdef"

    def test_uppercase(self):
        assert normalize_ieee("00124B0001ABCDEF") == "00124b0001abcdef"


class TestZhaLqi:
    def test_none_returns_zero(self):
        assert _zha_lqi(None) == 0

    def test_string_int(self):
        assert _zha_lqi("180") == 180

    def test_int_passthrough(self):
        assert _zha_lqi(200) == 200

    def test_invalid_string_returns_zero(self):
        assert _zha_lqi("bad") == 0

    def test_non_numeric_type_returns_zero(self):
        assert _zha_lqi([1, 2, 3]) == 0


class TestBuildRoutingTree:
    def test_empty_graph(self):
        parent_map, lqi_map, depth_map = build_routing_tree({}, [])
        assert parent_map == {}
        assert lqi_map == {}
        assert depth_map == {}

    def test_no_coordinator(self):
        nodes = {"0xaaa": {"ieeeAddr": "0xaaa", "type": "Router"}}
        parent_map, lqi_map, depth_map = build_routing_tree(nodes, [])
        assert parent_map == {}

    def test_coordinator_only(self):
        nodes = {"0xaaa": {"ieeeAddr": "0xaaa", "type": "Coordinator"}}
        parent_map, lqi_map, depth_map = build_routing_tree(nodes, [])
        assert parent_map == {"0xaaa": None}
        assert depth_map == {"0xaaa": 0}

    def test_simple_tree(self, sample_z2m_nodes, sample_z2m_links):
        parent_map, lqi_map, depth_map = build_routing_tree(sample_z2m_nodes, sample_z2m_links)
        coord = "0x00124b0001abcdef"
        router1 = "0x00124b0002aaaaaa"
        router2 = "0x00124b0003bbbbbb"
        end_device = "0x00124b0004cccccc"

        assert parent_map[coord] is None
        assert parent_map[router1] == coord
        assert parent_map[router2] == coord
        assert parent_map[end_device] == router1

        assert depth_map[coord] == 0
        assert depth_map[router1] == 1
        assert depth_map[router2] == 1
        assert depth_map[end_device] == 2

        # LQI should be min of bidirectional (165 for router1)
        assert lqi_map[router1] == 165
        # LQI should be min of bidirectional (95 for router2)
        assert lqi_map[router2] == 95
        # End device LQI: min(140, 130) = 130
        assert lqi_map[end_device] == 130

    def test_orphaned_nodes_attached_to_coordinator(self):
        nodes = {
            "0xcoord": {"ieeeAddr": "0xcoord", "type": "Coordinator"},
            "0xorphan": {"ieeeAddr": "0xorphan", "type": "EndDevice"},
        }
        parent_map, lqi_map, depth_map = build_routing_tree(nodes, [])
        assert parent_map["0xorphan"] == "0xcoord"
        assert lqi_map["0xorphan"] == 0
        assert depth_map["0xorphan"] == 1


class TestBuildZhaTopologyFromDevices:
    def test_builds_nodes_and_links(self, sample_zha_devices):
        nodes, links = build_zha_topology_from_devices(sample_zha_devices)
        assert len(nodes) == 4
        assert any(link["lqi"] == 180 for link in links)

    def test_normalizes_ieee(self, sample_zha_devices):
        nodes, _ = build_zha_topology_from_devices(sample_zha_devices)
        for ieee in nodes:
            assert ":" not in ieee
            assert ieee == ieee.lower()

    def test_skips_device_without_ieee(self):
        devices = [
            {"ieee": "", "name": "Ghost", "device_type": "Router"},
            {"ieee": "00:11:22:33:44:55:66:77", "name": "Real", "device_type": "Router"},
        ]
        nodes, _ = build_zha_topology_from_devices(devices)
        assert len(nodes) == 1

    def test_skips_neighbor_without_ieee(self):
        devices = [
            {
                "ieee": "00:11:22:33:44:55:66:77",
                "name": "Router",
                "device_type": "Router",
                "neighbors": [{"ieee": "", "lqi": "100", "relationship": "Child"}],
            },
        ]
        nodes, links = build_zha_topology_from_devices(devices)
        assert len(nodes) == 1
        assert len(links) == 0

    def test_neighbor_lqi_zero_falls_back_to_device_lqi(self):
        """Router reports neighbor with LQI=0 (sleepy), fallback to device-level LQI."""
        devices = [
            {
                "ieee": "00:11:22:33:44:55:66:00",
                "name": "Coordinator",
                "device_type": "Coordinator",
                "lqi": 255,
                "neighbors": [
                    {"ieee": "00:11:22:33:44:55:66:01", "lqi": "152", "relationship": "Child"},
                ],
            },
            {
                "ieee": "00:11:22:33:44:55:66:01",
                "name": "Range Extender",
                "device_type": "Router",
                "lqi": 152,
                "neighbors": [
                    {"ieee": "00:11:22:33:44:55:66:00", "lqi": "152", "relationship": "Parent"},
                    {"ieee": "00:11:22:33:44:55:66:02", "lqi": "0", "relationship": "Child"},
                ],
            },
            {
                "ieee": "00:11:22:33:44:55:66:02",
                "name": "Krypgrund Temp Sensor",
                "device_type": "EndDevice",
                "lqi": 95,
            },
        ]
        nodes, links = build_zha_topology_from_devices(devices)
        sensor_ieee = normalize_ieee("00:11:22:33:44:55:66:02")
        sensor_links = [lk for lk in links if lk["source"]["ieeeAddr"] == sensor_ieee]
        assert sensor_links[0]["lqi"] == 95

        parent_map, lqi_map, depth_map = build_routing_tree(nodes, links)
        assert lqi_map[sensor_ieee] == 95
        assert depth_map[sensor_ieee] == 2

    def test_orphan_device_gets_synthetic_link_from_device_lqi(self):
        """End device not in any neighbor table uses device-level LQI as fallback."""
        devices = [
            {
                "ieee": "00:11:22:33:44:55:66:00",
                "name": "Coordinator",
                "device_type": "Coordinator",
                "lqi": 255,
                "neighbors": [
                    {"ieee": "00:11:22:33:44:55:66:01", "lqi": "150", "relationship": "Child"},
                ],
            },
            {
                "ieee": "00:11:22:33:44:55:66:01",
                "name": "Router",
                "device_type": "Router",
                "lqi": 150,
                "neighbors": [
                    {"ieee": "00:11:22:33:44:55:66:00", "lqi": "150", "relationship": "Parent"},
                ],
            },
            {
                "ieee": "00:11:22:33:44:55:66:02",
                "name": "Orphan Sensor",
                "device_type": "EndDevice",
                "lqi": 120,
            },
        ]
        nodes, links = build_zha_topology_from_devices(devices)
        coord_ieee = normalize_ieee("00:11:22:33:44:55:66:00")
        orphan_ieee = normalize_ieee("00:11:22:33:44:55:66:02")
        synthetic = [
            lk for lk in links if lk["source"]["ieeeAddr"] == orphan_ieee and lk["lqi"] == 120
        ]
        assert len(synthetic) == 1
        assert synthetic[0]["target"]["ieeeAddr"] == coord_ieee

        parent_map, lqi_map, depth_map = build_routing_tree(nodes, links)
        assert lqi_map[orphan_ieee] == 120
        assert depth_map[orphan_ieee] == 1

    def test_orphan_device_with_zero_lqi_stays_unknown(self):
        """Orphan with device-level LQI=0 still renders as unknown (no synthetic link)."""
        devices = [
            {
                "ieee": "00:11:22:33:44:55:66:00",
                "name": "Coordinator",
                "device_type": "Coordinator",
                "lqi": 255,
                "neighbors": [],
            },
            {
                "ieee": "00:11:22:33:44:55:66:02",
                "name": "Dead Sensor",
                "device_type": "EndDevice",
                "lqi": 0,
            },
        ]
        nodes, links = build_zha_topology_from_devices(devices)
        orphan_ieee = normalize_ieee("00:11:22:33:44:55:66:02")
        synthetic = [lk for lk in links if lk["source"]["ieeeAddr"] == orphan_ieee]
        assert len(synthetic) == 0


class TestBuildFlatZhaTopology:
    def test_all_at_depth_one(self, sample_zha_devices_no_neighbors):
        nodes, links = build_flat_zha_topology(sample_zha_devices_no_neighbors)
        assert len(links) == 2
        coord_ieee = normalize_ieee("00:12:4b:00:01:ab:cd:ef")
        for link in links:
            assert link["target"]["ieeeAddr"] == coord_ieee

    def test_empty_devices(self):
        nodes, links = build_flat_zha_topology([])
        assert nodes == {}
        assert links == []

    def test_skips_device_without_ieee(self):
        devices = [
            {"ieee": "00:11:22:33:44:55:66:77", "name": "Coord", "device_type": "Coordinator"},
            {"ieee": "", "name": "Ghost", "device_type": "Router"},
        ]
        nodes, links = build_flat_zha_topology(devices)
        assert len(nodes) == 1
        assert len(links) == 0


class TestBuildRoutingTreeEdgeCases:
    def test_previous_child_relationship_skipped(self):
        nodes = {
            "0xcoord": {"ieeeAddr": "0xcoord", "type": "Coordinator"},
            "0xrouter": {"ieeeAddr": "0xrouter", "type": "Router"},
        }
        links = [
            {
                "source": {"ieeeAddr": "0xrouter"},
                "target": {"ieeeAddr": "0xcoord"},
                "lqi": 200,
                "relationship": "PreviousChild",
            },
            {
                "source": {"ieeeAddr": "0xcoord"},
                "target": {"ieeeAddr": "0xrouter"},
                "lqi": 180,
                "relationship": "",
            },
        ]
        parent_map, lqi_map, depth_map = build_routing_tree(nodes, links)
        assert parent_map["0xrouter"] == "0xcoord"

    def test_depth_cascade_correction(self):
        nodes = {
            "0xcoord": {"ieeeAddr": "0xcoord", "type": "Coordinator"},
            "0xa": {"ieeeAddr": "0xa", "type": "Router"},
            "0xb": {"ieeeAddr": "0xb", "type": "Router"},
            "0xc": {"ieeeAddr": "0xc", "type": "EndDevice"},
        }
        links = [
            {"source": {"ieeeAddr": "0xa"}, "target": {"ieeeAddr": "0xcoord"}, "lqi": 200},
            {"source": {"ieeeAddr": "0xcoord"}, "target": {"ieeeAddr": "0xa"}, "lqi": 200},
            {"source": {"ieeeAddr": "0xb"}, "target": {"ieeeAddr": "0xa"}, "lqi": 150},
            {"source": {"ieeeAddr": "0xa"}, "target": {"ieeeAddr": "0xb"}, "lqi": 150},
            {"source": {"ieeeAddr": "0xc"}, "target": {"ieeeAddr": "0xb"}, "lqi": 100},
            {"source": {"ieeeAddr": "0xb"}, "target": {"ieeeAddr": "0xc"}, "lqi": 100},
        ]
        parent_map, lqi_map, depth_map = build_routing_tree(nodes, links)
        assert depth_map["0xcoord"] == 0
        assert depth_map["0xa"] == 1
        assert depth_map["0xb"] == 2
        assert depth_map["0xc"] == 3

    def test_coordinator_bonus_prefers_coordinator(self):
        """Device with similar LQI to coord and router should prefer coordinator."""
        nodes = {
            "0xcoord": {"ieeeAddr": "0xcoord", "type": "Coordinator"},
            "0xrouter": {"ieeeAddr": "0xrouter", "type": "Router"},
            "0xdevice": {"ieeeAddr": "0xdevice", "type": "EndDevice"},
        }
        # Device sees coordinator at LQI 140 and router at LQI 150
        # Without bonus: coord score = 140, router score = 150-10 = 140 (tie)
        # With bonus (15): coord score = 140+15 = 155 > router score = 140
        links = [
            {"source": {"ieeeAddr": "0xrouter"}, "target": {"ieeeAddr": "0xcoord"}, "lqi": 200},
            {"source": {"ieeeAddr": "0xcoord"}, "target": {"ieeeAddr": "0xrouter"}, "lqi": 200},
            {"source": {"ieeeAddr": "0xdevice"}, "target": {"ieeeAddr": "0xcoord"}, "lqi": 140},
            {"source": {"ieeeAddr": "0xcoord"}, "target": {"ieeeAddr": "0xdevice"}, "lqi": 140},
            {"source": {"ieeeAddr": "0xdevice"}, "target": {"ieeeAddr": "0xrouter"}, "lqi": 150},
            {"source": {"ieeeAddr": "0xrouter"}, "target": {"ieeeAddr": "0xdevice"}, "lqi": 150},
        ]
        parent_map, lqi_map, depth_map = build_routing_tree(nodes, links)
        assert parent_map["0xdevice"] == "0xcoord"
        assert depth_map["0xdevice"] == 1
