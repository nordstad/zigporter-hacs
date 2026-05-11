"""Tests for network_map_svg renderer."""

import xml.etree.ElementTree as ET

from custom_components.zigporter.network_map import build_routing_tree
from custom_components.zigporter.network_map_svg import render_svg


class TestRenderSvg:
    def test_empty_nodes(self):
        svg = render_svg(nodes={}, parent_map={}, lqi_map={}, depth_map={})
        assert "No devices found" in svg

    def test_valid_xml(self, sample_z2m_nodes, sample_z2m_links):
        parent_map, lqi_map, depth_map = build_routing_tree(sample_z2m_nodes, sample_z2m_links)
        svg = render_svg(
            nodes=sample_z2m_nodes,
            parent_map=parent_map,
            lqi_map=lqi_map,
            depth_map=depth_map,
        )
        root = ET.fromstring(svg)
        assert root.tag == "{http://www.w3.org/2000/svg}svg" or root.tag == "svg"

    def test_contains_nodes(self, sample_z2m_nodes, sample_z2m_links):
        parent_map, lqi_map, depth_map = build_routing_tree(sample_z2m_nodes, sample_z2m_links)
        svg = render_svg(
            nodes=sample_z2m_nodes,
            parent_map=parent_map,
            lqi_map=lqi_map,
            depth_map=depth_map,
        )
        assert "Coordinator" in svg
        assert "Living Room Router" in svg
        assert "Kitchen Router" in svg
        assert "Bedroom Sensor" in svg

    def test_contains_lqi_annotations(self, sample_z2m_nodes, sample_z2m_links):
        parent_map, lqi_map, depth_map = build_routing_tree(sample_z2m_nodes, sample_z2m_links)
        svg = render_svg(
            nodes=sample_z2m_nodes,
            parent_map=parent_map,
            lqi_map=lqi_map,
            depth_map=depth_map,
        )
        assert "LQI:" in svg

    def test_edge_colors(self, sample_z2m_nodes, sample_z2m_links):
        parent_map, lqi_map, depth_map = build_routing_tree(sample_z2m_nodes, sample_z2m_links)
        svg = render_svg(
            nodes=sample_z2m_nodes,
            parent_map=parent_map,
            lqi_map=lqi_map,
            depth_map=depth_map,
            warn_lqi=100,
            critical_lqi=50,
        )
        # Router2 has LQI 95 which is below warn=100 -> should use warn color
        assert "#f59e0b" in svg

    def test_label_truncation(self):
        nodes = {
            "0xcoord": {
                "ieeeAddr": "0xcoord",
                "friendlyName": "Coordinator",
                "type": "Coordinator",
            },
            "0xlong": {
                "ieeeAddr": "0xlong",
                "friendlyName": "A Very Long Device Name That Exceeds Max",
                "type": "Router",
            },
        }
        links = [
            {"source": {"ieeeAddr": "0xlong"}, "target": {"ieeeAddr": "0xcoord"}, "lqi": 200},
            {"source": {"ieeeAddr": "0xcoord"}, "target": {"ieeeAddr": "0xlong"}, "lqi": 200},
        ]
        parent_map, lqi_map, depth_map = build_routing_tree(nodes, links)
        svg = render_svg(nodes=nodes, parent_map=parent_map, lqi_map=lqi_map, depth_map=depth_map)
        # Full name should not appear in text elements (truncated to 22 chars)
        assert "A Very Long Device Nam" in svg
        # But full name should be in <title> tooltip
        assert "A Very Long Device Name That Exceeds Max" in svg

    def test_special_characters_escaped(self):
        nodes = {
            "0xcoord": {
                "ieeeAddr": "0xcoord",
                "friendlyName": "Coordinator",
                "type": "Coordinator",
            },
            "0xspecial": {
                "ieeeAddr": "0xspecial",
                "friendlyName": '<script>"alert&</script>',
                "type": "Router",
            },
        }
        links = [
            {
                "source": {"ieeeAddr": "0xspecial"},
                "target": {"ieeeAddr": "0xcoord"},
                "lqi": 100,
            },
            {
                "source": {"ieeeAddr": "0xcoord"},
                "target": {"ieeeAddr": "0xspecial"},
                "lqi": 100,
            },
        ]
        parent_map, lqi_map, depth_map = build_routing_tree(nodes, links)
        svg = render_svg(nodes=nodes, parent_map=parent_map, lqi_map=lqi_map, depth_map=depth_map)
        # Should be valid XML (ET auto-escapes)
        ET.fromstring(svg)
        # Raw < and > should NOT appear unescaped
        assert "<script>" not in svg
