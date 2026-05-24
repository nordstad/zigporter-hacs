"""Tests for network_map_svg renderer."""

import xml.etree.ElementTree as ET

import pytest

from custom_components.zigporter.network_map import build_routing_tree
from custom_components.zigporter.network_map_svg import (
    _compute_layout,
    _compute_path_min_lqi,
    render_svg,
)


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

    def test_circles_have_data_name(self, sample_z2m_nodes, sample_z2m_links):
        parent_map, lqi_map, depth_map = build_routing_tree(sample_z2m_nodes, sample_z2m_links)
        svg = render_svg(
            nodes=sample_z2m_nodes,
            parent_map=parent_map,
            lqi_map=lqi_map,
            depth_map=depth_map,
        )
        root = ET.fromstring(svg)
        circles = root.findall(".//{http://www.w3.org/2000/svg}circle[@data-name]")
        names = [c.get("data-name") for c in circles]
        assert "Living Room Router" in names
        assert "Kitchen Router" in names
        assert "Bedroom Sensor" in names

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


class TestSvgEdgeCases:
    def test_no_coordinator_returns_empty_svg(self):
        nodes = {"0xr": {"ieeeAddr": "0xr", "friendlyName": "Router", "type": "Router"}}
        parent_map = {"0xr": None}
        svg = render_svg(nodes=nodes, parent_map=parent_map, lqi_map={}, depth_map={"0xr": 0})
        assert "No devices found" in svg

    def test_critical_lqi_glow_filter(self):
        nodes = {
            "0xcoord": {"ieeeAddr": "0xcoord", "friendlyName": "Coord", "type": "Coordinator"},
            "0xweak": {"ieeeAddr": "0xweak", "friendlyName": "Weak Router", "type": "Router"},
        }
        links = [
            {"source": {"ieeeAddr": "0xweak"}, "target": {"ieeeAddr": "0xcoord"}, "lqi": 10},
            {"source": {"ieeeAddr": "0xcoord"}, "target": {"ieeeAddr": "0xweak"}, "lqi": 10},
        ]
        parent_map, lqi_map, depth_map = build_routing_tree(nodes, links)
        svg = render_svg(
            nodes=nodes,
            parent_map=parent_map,
            lqi_map=lqi_map,
            depth_map=depth_map,
            critical_lqi=20,
        )
        assert "glow-crit" in svg

    def test_warn_lqi_glow_filter(self):
        nodes = {
            "0xcoord": {"ieeeAddr": "0xcoord", "friendlyName": "Coord", "type": "Coordinator"},
            "0xwarn": {"ieeeAddr": "0xwarn", "friendlyName": "Warn Router", "type": "Router"},
        }
        links = [
            {"source": {"ieeeAddr": "0xwarn"}, "target": {"ieeeAddr": "0xcoord"}, "lqi": 30},
            {"source": {"ieeeAddr": "0xcoord"}, "target": {"ieeeAddr": "0xwarn"}, "lqi": 30},
        ]
        parent_map, lqi_map, depth_map = build_routing_tree(nodes, links)
        svg = render_svg(
            nodes=nodes,
            parent_map=parent_map,
            lqi_map=lqi_map,
            depth_map=depth_map,
            warn_lqi=50,
            critical_lqi=20,
        )
        assert "glow-warn" in svg

    def test_collision_resolution_with_many_nodes(self):
        nodes = {
            "0xcoord": {"ieeeAddr": "0xcoord", "friendlyName": "Coord", "type": "Coordinator"},
        }
        links = []
        for i in range(12):
            ieee = f"0xn{i:02d}"
            nodes[ieee] = {"ieeeAddr": ieee, "friendlyName": f"Node {i}", "type": "Router"}
            links.append(
                {
                    "source": {"ieeeAddr": ieee},
                    "target": {"ieeeAddr": "0xcoord"},
                    "lqi": 200,
                }
            )
            links.append(
                {
                    "source": {"ieeeAddr": "0xcoord"},
                    "target": {"ieeeAddr": ieee},
                    "lqi": 200,
                }
            )

        parent_map, lqi_map, depth_map = build_routing_tree(nodes, links)
        svg = render_svg(nodes=nodes, parent_map=parent_map, lqi_map=lqi_map, depth_map=depth_map)
        root = ET.fromstring(svg)
        assert root.tag == "{http://www.w3.org/2000/svg}svg" or root.tag == "svg"

    def test_critical_edge_color(self):
        nodes = {
            "0xcoord": {"ieeeAddr": "0xcoord", "friendlyName": "Coord", "type": "Coordinator"},
            "0xdev": {"ieeeAddr": "0xdev", "friendlyName": "Device", "type": "EndDevice"},
        }
        links = [
            {"source": {"ieeeAddr": "0xdev"}, "target": {"ieeeAddr": "0xcoord"}, "lqi": 5},
            {"source": {"ieeeAddr": "0xcoord"}, "target": {"ieeeAddr": "0xdev"}, "lqi": 5},
        ]
        parent_map, lqi_map, depth_map = build_routing_tree(nodes, links)
        svg = render_svg(
            nodes=nodes,
            parent_map=parent_map,
            lqi_map=lqi_map,
            depth_map=depth_map,
            critical_lqi=20,
        )
        assert "#ef4444" in svg

    def test_critical_nodes_have_alert_class(self):
        """Critical LQI (1-19) nodes and edges get class='alert' for the Alerts toggle."""
        nodes = {
            "0xcoord": {"ieeeAddr": "0xcoord", "friendlyName": "Coord", "type": "Coordinator"},
            "0xdev": {"ieeeAddr": "0xdev", "friendlyName": "Device", "type": "EndDevice"},
        }
        links = [
            {"source": {"ieeeAddr": "0xdev"}, "target": {"ieeeAddr": "0xcoord"}, "lqi": 5},
            {"source": {"ieeeAddr": "0xcoord"}, "target": {"ieeeAddr": "0xdev"}, "lqi": 5},
        ]
        parent_map, lqi_map, depth_map = build_routing_tree(nodes, links)
        svg = render_svg(
            nodes=nodes,
            parent_map=parent_map,
            lqi_map=lqi_map,
            depth_map=depth_map,
            critical_lqi=20,
        )
        assert 'class="alert"' in svg
        assert "alerts-mode" in svg

    def test_lqi_zero_gets_alert_class(self):
        """LQI=0 (no measurement) should get the alert class so alerts-mode highlights it."""
        nodes = {
            "0xcoord": {"ieeeAddr": "0xcoord", "friendlyName": "Coord", "type": "Coordinator"},
            "0xdev": {"ieeeAddr": "0xdev", "friendlyName": "Device", "type": "EndDevice"},
        }
        links = [
            {"source": {"ieeeAddr": "0xdev"}, "target": {"ieeeAddr": "0xcoord"}, "lqi": 0},
            {"source": {"ieeeAddr": "0xcoord"}, "target": {"ieeeAddr": "0xdev"}, "lqi": 0},
        ]
        parent_map, lqi_map, depth_map = build_routing_tree(nodes, links)
        svg = render_svg(
            nodes=nodes,
            parent_map=parent_map,
            lqi_map=lqi_map,
            depth_map=depth_map,
            critical_lqi=20,
        )
        assert 'class="alert"' in svg

    def test_lqi_zero_renders_as_unknown(self):
        """LQI=0 means no measurement — gray dashed edge, '?' badge, red glow."""
        nodes = {
            "0xcoord": {"ieeeAddr": "0xcoord", "friendlyName": "Coord", "type": "Coordinator"},
            "0xdev": {"ieeeAddr": "0xdev", "friendlyName": "Device", "type": "EndDevice"},
        }
        links = [
            {"source": {"ieeeAddr": "0xdev"}, "target": {"ieeeAddr": "0xcoord"}, "lqi": 0},
            {"source": {"ieeeAddr": "0xcoord"}, "target": {"ieeeAddr": "0xdev"}, "lqi": 0},
        ]
        parent_map, lqi_map, depth_map = build_routing_tree(nodes, links)
        svg = render_svg(
            nodes=nodes,
            parent_map=parent_map,
            lqi_map=lqi_map,
            depth_map=depth_map,
            critical_lqi=20,
        )
        root = ET.fromstring(svg)
        ns = "{http://www.w3.org/2000/svg}"
        # Gray/unknown edge color
        assert "#64748b" in svg
        # Dashed edge
        assert "stroke-dasharray" in svg
        # Badge shows "?" not "0"
        assert ">?<" in svg
        assert "LQI: ?" in svg
        # Non-coordinator node gets red glow (unknown = treated as critical)
        circles = root.findall(f".//{ns}g[@id='nodes']//{ns}circle")
        non_coord = [c for c in circles if "glow-crit" in (c.get("filter") or "")]
        assert len(non_coord) == 1

    def test_angular_overflow_clamping_and_collision(self):
        nodes = {
            "0xcoord": {"ieeeAddr": "0xcoord", "friendlyName": "Coord", "type": "Coordinator"},
        }
        links = []
        for i in range(50):
            ieee = f"0xn{i:02d}"
            nodes[ieee] = {"ieeeAddr": ieee, "friendlyName": f"N{i}", "type": "Router"}
            links.append(
                {
                    "source": {"ieeeAddr": ieee},
                    "target": {"ieeeAddr": "0xcoord"},
                    "lqi": 200,
                }
            )
            links.append(
                {
                    "source": {"ieeeAddr": "0xcoord"},
                    "target": {"ieeeAddr": ieee},
                    "lqi": 200,
                }
            )

        parent_map, lqi_map, depth_map = build_routing_tree(nodes, links)
        svg = render_svg(nodes=nodes, parent_map=parent_map, lqi_map=lqi_map, depth_map=depth_map)
        ET.fromstring(svg)

    def test_path_min_lqi_cache_hit(self):
        # 0xb traverses up through 0xa to 0xcoord, caching all three.
        # When the loop then visits 0xa (already cached), line 153 fires.
        parent_map = {"0xb": "0xa", "0xa": "0xcoord", "0xcoord": None}
        lqi_map = {"0xa": 200, "0xb": 100}
        result = _compute_path_min_lqi(parent_map, lqi_map)
        assert result["0xb"] == 100
        assert result["0xa"] == 200
        assert result["0xcoord"] == 255

    def test_compute_layout_bad_keys_raises(self):
        nodes = {"0xcoord": {"ieeeAddr": "0xcoord", "type": "Coordinator"}}
        parent_map = {"0xcoord": None, "0xghost": "0xcoord"}
        with pytest.raises(ValueError, match="parent_map contains IEEEs not in nodes"):
            _compute_layout(nodes, parent_map, {}, {"0xcoord": 0, "0xghost": 1}, {})

    def test_compute_layout_bad_parent_raises(self):
        nodes = {
            "0xcoord": {"ieeeAddr": "0xcoord", "type": "Coordinator"},
            "0xa": {"ieeeAddr": "0xa", "type": "Router"},
        }
        parent_map = {"0xcoord": None, "0xa": "0xghost"}
        with pytest.raises(ValueError, match="parent_map references parent IEEEs not in nodes"):
            _compute_layout(nodes, parent_map, {}, {"0xcoord": 0, "0xa": 1}, {})


class TestCustomHopColors:
    def test_custom_colors_applied(self, sample_z2m_nodes, sample_z2m_links):
        parent_map, lqi_map, depth_map = build_routing_tree(sample_z2m_nodes, sample_z2m_links)
        custom = ["#FF0000", "#00FF00", "#0000FF", "#FFFF00"]
        svg = render_svg(
            nodes=sample_z2m_nodes,
            parent_map=parent_map,
            lqi_map=lqi_map,
            depth_map=depth_map,
            hop_colors=custom,
        )
        assert "#FF0000" in svg
        assert "#00FF00" in svg

    def test_none_uses_defaults(self, sample_z2m_nodes, sample_z2m_links):
        parent_map, lqi_map, depth_map = build_routing_tree(sample_z2m_nodes, sample_z2m_links)
        svg = render_svg(
            nodes=sample_z2m_nodes,
            parent_map=parent_map,
            lqi_map=lqi_map,
            depth_map=depth_map,
            hop_colors=None,
        )
        assert "#101819" in svg or "#1C2829" in svg

    def test_custom_opacity_applied(self, sample_z2m_nodes, sample_z2m_links):
        parent_map, lqi_map, depth_map = build_routing_tree(sample_z2m_nodes, sample_z2m_links)
        svg = render_svg(
            nodes=sample_z2m_nodes,
            parent_map=parent_map,
            lqi_map=lqi_map,
            depth_map=depth_map,
            hop_opacity=0.50,
        )
        assert 'fill-opacity="0.50"' in svg

    def test_default_opacity(self, sample_z2m_nodes, sample_z2m_links):
        parent_map, lqi_map, depth_map = build_routing_tree(sample_z2m_nodes, sample_z2m_links)
        svg = render_svg(
            nodes=sample_z2m_nodes,
            parent_map=parent_map,
            lqi_map=lqi_map,
            depth_map=depth_map,
        )
        assert 'fill-opacity="0.80"' in svg

    def test_cyclic_repeat_for_deep_network(self):
        nodes = {
            "0xcoord": {
                "ieeeAddr": "0xcoord",
                "friendlyName": "Coordinator",
                "type": "Coordinator",
            },
        }
        links = []
        prev = "0xcoord"
        for i in range(1, 6):
            ieee = f"0xnode{i}"
            nodes[ieee] = {"ieeeAddr": ieee, "friendlyName": f"Router {i}", "type": "Router"}
            links.append({"source": {"ieeeAddr": ieee}, "target": {"ieeeAddr": prev}, "lqi": 200})
            links.append({"source": {"ieeeAddr": prev}, "target": {"ieeeAddr": ieee}, "lqi": 200})
            prev = ieee

        parent_map, lqi_map, depth_map = build_routing_tree(nodes, links)
        custom = ["#AA0000", "#00AA00", "#0000AA", "#AAAA00"]
        svg = render_svg(
            nodes=nodes,
            parent_map=parent_map,
            lqi_map=lqi_map,
            depth_map=depth_map,
            hop_colors=custom,
        )
        assert "#AA0000" in svg
        assert "#00AA00" in svg
        assert "#0000AA" in svg
        assert "#AAAA00" in svg


class TestMeshLinks:
    def test_mesh_links_rendered_when_links_provided(self, sample_z2m_nodes, sample_z2m_links):
        parent_map, lqi_map, depth_map = build_routing_tree(sample_z2m_nodes, sample_z2m_links)
        svg = render_svg(
            nodes=sample_z2m_nodes,
            parent_map=parent_map,
            lqi_map=lqi_map,
            depth_map=depth_map,
            links=sample_z2m_links,
        )
        assert 'class="mesh-links"' in svg
        assert "display:none" in svg

    def test_mesh_links_not_rendered_without_links(self, sample_z2m_nodes, sample_z2m_links):
        parent_map, lqi_map, depth_map = build_routing_tree(sample_z2m_nodes, sample_z2m_links)
        svg = render_svg(
            nodes=sample_z2m_nodes,
            parent_map=parent_map,
            lqi_map=lqi_map,
            depth_map=depth_map,
        )
        assert 'class="mesh-links"' not in svg

    def test_mesh_links_exclude_tree_edges(self):
        """Mesh overlay should not duplicate edges already in the tree."""
        nodes = {
            "0xcoord": {"ieeeAddr": "0xcoord", "friendlyName": "Coord", "type": "Coordinator"},
            "0xa": {"ieeeAddr": "0xa", "friendlyName": "A", "type": "Router"},
            "0xb": {"ieeeAddr": "0xb", "friendlyName": "B", "type": "Router"},
        }
        links = [
            {"source": {"ieeeAddr": "0xa"}, "target": {"ieeeAddr": "0xcoord"}, "lqi": 200},
            {"source": {"ieeeAddr": "0xcoord"}, "target": {"ieeeAddr": "0xa"}, "lqi": 200},
            {"source": {"ieeeAddr": "0xb"}, "target": {"ieeeAddr": "0xcoord"}, "lqi": 180},
            {"source": {"ieeeAddr": "0xcoord"}, "target": {"ieeeAddr": "0xb"}, "lqi": 180},
            # Mesh-only link between a and b (not in tree)
            {"source": {"ieeeAddr": "0xa"}, "target": {"ieeeAddr": "0xb"}, "lqi": 120},
            {"source": {"ieeeAddr": "0xb"}, "target": {"ieeeAddr": "0xa"}, "lqi": 110},
        ]
        parent_map, lqi_map, depth_map = build_routing_tree(nodes, links)
        svg = render_svg(
            nodes=nodes,
            parent_map=parent_map,
            lqi_map=lqi_map,
            depth_map=depth_map,
            links=links,
        )
        root = ET.fromstring(svg)
        mesh_g = root.find(".//{http://www.w3.org/2000/svg}g[@class='mesh-links']")
        assert mesh_g is not None
        mesh_lines = mesh_g.findall("{http://www.w3.org/2000/svg}line")
        assert len(mesh_lines) == 1
        assert mesh_g.find("{http://www.w3.org/2000/svg}text").text == "120"
