"""Tests for network_map graph algorithms."""

from custom_components.zigporter.network_map import (
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


class TestBuildFlatZhaTopology:
    def test_all_at_depth_one(self, sample_zha_devices_no_neighbors):
        nodes, links = build_flat_zha_topology(sample_zha_devices_no_neighbors)
        # All non-coordinator nodes should link to coordinator
        assert len(links) == 2
        coord_ieee = normalize_ieee("00:12:4b:00:01:ab:cd:ef")
        for link in links:
            assert link["target"]["ieeeAddr"] == coord_ieee

    def test_empty_devices(self):
        nodes, links = build_flat_zha_topology([])
        assert nodes == {}
        assert links == []
