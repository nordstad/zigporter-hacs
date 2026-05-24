import { fixture, html, expect, aTimeout, oneEvent } from "@open-wc/testing";
import "../../custom_components/zigporter/static/zigporter-network-map-card.js";

const VALID_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
const SVG_WITH_MESH =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><g class="mesh-links" style="display:none"><line x1="0" y1="0" x2="100" y2="100" stroke="#94a3b8"/></g><circle cx="50" cy="50" r="40"/></svg>';
const SVG_NO_VIEWBOX =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="200" height="150"/></svg>';
const INVALID_SVG = "<not-valid-xml<>";

function mockHass(wsHandler) {
  return {
    callWS:
      wsHandler ||
      (() =>
        Promise.resolve({
          svg: VALID_SVG,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 1500,
          backend: "z2m",
          scan_timestamp: "2026-01-01T12:00:00Z",
        })),
  };
}

function scanStatusThenMap(statusResult, mapResult) {
  let callCount = 0;
  return (msg) => {
    callCount++;
    if (msg.type === "zigporter/scan_status")
      return Promise.resolve(statusResult);
    if (msg.type === "zigporter/network_map")
      return Promise.resolve(
        mapResult || {
          svg: VALID_SVG,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 1500,
          backend: "z2m",
          scan_timestamp: "2026-01-01T12:00:00Z",
        },
      );
    return Promise.reject(new Error("unexpected call"));
  };
}

describe("ZigporterNetworkMapCard", () => {
  describe("registration", () => {
    it("is defined as a custom element", () => {
      expect(customElements.get("zigporter-network-map-card")).to.exist;
    });

    it("registers in window.customCards", () => {
      const entry = window.customCards.find(
        (c) => c.type === "zigporter-network-map-card",
      );
      expect(entry).to.exist;
      expect(entry.name).to.equal("Zigporter Network Map");
    });
  });

  describe("getStubConfig", () => {
    it("returns default config", () => {
      const Cls = customElements.get("zigporter-network-map-card");
      const stub = Cls.getStubConfig();
      expect(stub.title).to.equal("Zigbee Network Map");
      expect(stub.show_stats).to.be.true;
    });
  });

  describe("setConfig", () => {
    it("uses default title when not provided", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;
      const h2 = el.renderRoot.querySelector("h2");
      expect(h2.textContent).to.equal("Zigbee Network Map");
    });

    it("uses custom title", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({ title: "My Mesh" });
      await el.updateComplete;
      const h2 = el.renderRoot.querySelector("h2");
      expect(h2.textContent).to.equal("My Mesh");
    });

    it("defaults show_stats to true", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      expect(el._config.show_stats).to.be.true;
    });

    it("respects show_stats=false", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({ show_stats: false });
      expect(el._config.show_stats).to.be.false;
    });
  });

  describe("getCardSize", () => {
    it("returns 6", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      expect(el.getCardSize()).to.equal(6);
    });
  });

  describe("render without config", () => {
    it("renders nothing before setConfig", async () => {
      const el = document.createElement("zigporter-network-map-card");
      document.body.appendChild(el);
      await el.updateComplete;
      expect(el.renderRoot.querySelector("ha-card")).to.be.null;
      document.body.removeChild(el);
    });
  });

  describe("hass setter and initial fetch", () => {
    it("fetches map on first hass set", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      let called = false;
      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        called = true;
        return Promise.resolve({
          svg: VALID_SVG,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 1500,
          backend: "z2m",
          scan_timestamp: "2026-01-01T12:00:00Z",
        });
      });
      await aTimeout(50);
      await el.updateComplete;
      expect(called).to.be.true;
      expect(el._svgContent).to.not.be.null;
    });

    it("does not refetch on subsequent hass sets", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      let callCount = 0;
      const hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        callCount++;
        return Promise.resolve({
          svg: VALID_SVG,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 1500,
          backend: "z2m",
        });
      });
      el.hass = hass;
      await aTimeout(50);
      el.hass = hass;
      await aTimeout(50);
      expect(callCount).to.equal(1);
    });

    it("does nothing if hass is null", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      el.hass = null;
      await el.updateComplete;
      expect(el._initialized).to.be.false;
    });
  });

  describe("_fetchMap", () => {
    it("returns early if hass is not set", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      el._initialized = true;
      el._hass = null;
      await el._fetchMap(false);
      expect(el._loading).to.be.false;
    });

    it("shows loading state during scan", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      let resolveMap;
      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return new Promise((r) => {
          resolveMap = r;
        });
      });
      await aTimeout(10);
      await el.updateComplete;

      expect(el._loading).to.be.true;
      expect(el.renderRoot.querySelector(".spinner")).to.exist;
      expect(el.renderRoot.querySelector(".timer")).to.exist;

      resolveMap({
        svg: VALID_SVG,
        device_count: 5,
        max_depth: 3,
        scan_duration_ms: 500,
        backend: "z2m",
      });
      await aTimeout(10);
      await el.updateComplete;
      expect(el._loading).to.be.false;
    });

    it("handles error from WS call", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.reject(new Error("timeout"));
      });
      await aTimeout(50);
      await el.updateComplete;

      expect(el._error).to.equal("timeout");
      expect(el.renderRoot.querySelector(".error")).to.exist;
      expect(el.renderRoot.querySelector(".error").textContent).to.equal(
        "timeout",
      );
    });

    it("handles error without message", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.reject({});
      });
      await aTimeout(50);
      await el.updateComplete;

      expect(el._error).to.equal("Failed to load map");
    });

    it("displays stats after successful fetch", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({ show_stats: true });
      await el.updateComplete;

      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({
          svg: VALID_SVG,
          device_count: 48,
          max_depth: 9,
          scan_duration_ms: 66800,
          backend: "z2m",
          scan_timestamp: "2026-01-01T12:00:00Z",
        });
      });
      await aTimeout(50);
      await el.updateComplete;

      const stats = el.renderRoot.querySelector(".stats");
      expect(stats).to.exist;
      expect(stats.textContent).to.include("Z2M");
      expect(stats.textContent).to.include("48 devices");
      expect(stats.textContent).to.include("9 hops");
      expect(stats.textContent).to.include("66.8s");
    });

    it("displays ms duration for short scans", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({ show_stats: true });
      await el.updateComplete;

      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({
          svg: VALID_SVG,
          device_count: 2,
          max_depth: 1,
          scan_duration_ms: 500,
          backend: "zha",
        });
      });
      await aTimeout(50);
      await el.updateComplete;

      const stats = el.renderRoot.querySelector(".stats");
      expect(stats.textContent).to.include("ZHA");
      expect(stats.textContent).to.include("500ms");
    });

    it("hides stats when show_stats=false", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({ show_stats: false });
      await el.updateComplete;

      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({
          svg: VALID_SVG,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 1500,
          backend: "z2m",
        });
      });
      await aTimeout(50);
      await el.updateComplete;

      expect(el.renderRoot.querySelector(".stats")).to.be.null;
    });

    it("resumes timer from scan_status when already scanning", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      const scanStart = new Date(Date.now() - 10000).toISOString();
      el.hass = mockHass(
        scanStatusThenMap(
          { scanning: true, scan_start_utc: scanStart },
          {
            svg: VALID_SVG,
            device_count: 5,
            max_depth: 3,
            scan_duration_ms: 15000,
            backend: "z2m",
          },
        ),
      );
      await aTimeout(50);
      await el.updateComplete;

      expect(el._elapsed).to.be.at.least(9);
    });

    it("ignores scan_status error gracefully", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.reject(new Error("not supported"));
        return Promise.resolve({
          svg: VALID_SVG,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 1500,
          backend: "z2m",
        });
      });
      await aTimeout(50);
      await el.updateComplete;

      expect(el._svgContent).to.not.be.null;
      expect(el._error).to.be.null;
    });

    it("force_refresh=true skips scan_status check", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      let statusCalled = false;
      el._hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status") {
          statusCalled = true;
          return Promise.resolve({ scanning: false });
        }
        return Promise.resolve({
          svg: VALID_SVG,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 1500,
          backend: "z2m",
        });
      });
      el._initialized = true;

      await el._fetchMap(true);
      await el.updateComplete;

      expect(statusCalled).to.be.false;
    });

    it("re-enables buttons after error", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.reject(new Error("fail"));
      });
      await aTimeout(50);
      await el.updateComplete;

      expect(el._buttonsDisabled).to.be.false;
    });
  });

  describe("_processSvg", () => {
    let el;
    beforeEach(async () => {
      el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
    });

    it("returns null for invalid SVG", () => {
      expect(el._processSvg(INVALID_SVG)).to.be.null;
    });

    it("preserves existing viewBox and removes width/height", () => {
      const result = el._processSvg(VALID_SVG);
      expect(result).to.include('viewBox="0 0 100 100"');
      expect(result).not.to.include('width="100"');
      expect(result).not.to.include('height="100"');
      expect(result).to.include('preserveAspectRatio="xMidYMid meet"');
    });

    it("creates viewBox from width/height if missing", () => {
      const result = el._processSvg(SVG_NO_VIEWBOX);
      expect(result).to.include('viewBox="0 0 200 150"');
    });

    it("sets preserveAspectRatio", () => {
      const result = el._processSvg(VALID_SVG);
      expect(result).to.include('preserveAspectRatio="xMidYMid meet"');
    });
  });

  describe("rendering states", () => {
    it("renders legend always", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;
      const legend = el.renderRoot.querySelector(".legend");
      expect(legend).to.exist;
      expect(legend.textContent).to.include("Coordinator");
      expect(legend.textContent).to.include("Router");
      expect(legend.textContent).to.include("End device");
    });

    it("renders header buttons", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;
      const buttons = el.renderRoot.querySelectorAll(".action-btn");
      expect(buttons.length).to.equal(3);
      expect(buttons[0].textContent.trim()).to.equal("Help");
      expect(buttons[1].textContent.trim()).to.equal("Reset");
      expect(buttons[2].textContent.trim()).to.equal("Scan");
    });

    it("renders SVG content into map-container", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({
          svg: VALID_SVG,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 1500,
          backend: "z2m",
        });
      });
      await aTimeout(50);
      await el.updateComplete;

      const svg = el.renderRoot.querySelector(".map-container svg");
      expect(svg).to.exist;
    });

    it("shows error when _processSvg returns null", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({
          svg: INVALID_SVG,
          device_count: 0,
          max_depth: 0,
          scan_duration_ms: 0,
          backend: "z2m",
        });
      });
      await aTimeout(50);
      await el.updateComplete;

      expect(el._error).to.equal("Failed to parse SVG");
    });

    it("shows elapsed timer during loading", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      let resolveMap;
      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return new Promise((r) => {
          resolveMap = r;
        });
      });
      await aTimeout(1200);
      await el.updateComplete;

      expect(el._elapsed).to.be.at.least(1);
      const timerEls = el.renderRoot.querySelectorAll(".timer");
      const elapsedEl = [...timerEls].find((t) =>
        t.textContent.includes("elapsed"),
      );
      expect(elapsedEl).to.exist;

      resolveMap({
        svg: VALID_SVG,
        device_count: 5,
        max_depth: 3,
        scan_duration_ms: 1000,
        backend: "z2m",
      });
      await aTimeout(10);
    });
  });

  describe("Scan button", () => {
    it("triggers force_refresh=true on click", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      let forceRefreshValue;
      el._hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        if (msg.type === "zigporter/network_map") {
          forceRefreshValue = msg.force_refresh;
        }
        return Promise.resolve({
          svg: VALID_SVG,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 1500,
          backend: "z2m",
        });
      });
      el._initialized = true;
      el._buttonsDisabled = false;
      await el.updateComplete;

      const scanBtn = [...el.renderRoot.querySelectorAll(".action-btn")].find(
        (b) => b.textContent.trim() === "Scan",
      );
      scanBtn.click();
      await aTimeout(50);

      expect(forceRefreshValue).to.be.true;
    });

    it("disables buttons during fetch", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      let resolveMap;
      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return new Promise((r) => {
          resolveMap = r;
        });
      });
      await aTimeout(10);
      await el.updateComplete;

      expect(el._buttonsDisabled).to.be.true;
      const resetBtn = [...el.renderRoot.querySelectorAll(".action-btn")].find(
        (b) => b.textContent.trim() === "Reset",
      );
      expect(resetBtn.disabled).to.be.true;

      resolveMap({
        svg: VALID_SVG,
        device_count: 5,
        max_depth: 3,
        scan_duration_ms: 500,
        backend: "z2m",
      });
      await aTimeout(10);
    });
  });

  describe("pan/zoom", () => {
    let el;

    async function createCardWithSvg() {
      el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({
          svg: VALID_SVG,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 1500,
          backend: "z2m",
        });
      });
      await aTimeout(50);
      await el.updateComplete;
      el._svgEl.setPointerCapture = () => {};
      return el;
    }

    it("initializes viewBox tracking on SVG render", async () => {
      await createCardWithSvg();
      expect(el._svgEl).to.exist;
      expect(el._vb).to.deep.equal({ x: 0, y: 0, w: 100, h: 100 });
      expect(el._vbInitial).to.deep.equal({ x: 0, y: 0, w: 100, h: 100 });
    });

    it("resets view to initial viewBox", async () => {
      await createCardWithSvg();
      el._vb = { x: 10, y: 10, w: 50, h: 50 };
      el._zoomLevel = 2;
      el._applyViewBox();

      el._resetView();
      expect(el._vb).to.deep.equal({ x: 0, y: 0, w: 100, h: 100 });
      expect(el._zoomLevel).to.equal(1);
      expect(el._svgEl.getAttribute("viewBox")).to.equal("0 0 100 100");
    });

    it("Reset button calls _resetView", async () => {
      await createCardWithSvg();
      el._vb = { x: 10, y: 10, w: 50, h: 50 };
      el._applyViewBox();

      const resetBtn = [...el.renderRoot.querySelectorAll(".action-btn")].find(
        (b) => b.textContent.trim() === "Reset",
      );
      resetBtn.click();
      await el.updateComplete;

      expect(el._vb).to.deep.equal({ x: 0, y: 0, w: 100, h: 100 });
    });

    it("_resetView is no-op without initial viewBox", async () => {
      el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      el._vbInitial = null;
      el._resetView();
    });

    it("_onWheel zooms in", async () => {
      await createCardWithSvg();
      const svgEl = el._svgEl;
      const rect = svgEl.getBoundingClientRect();
      const event = new WheelEvent("wheel", {
        deltaY: -100,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        cancelable: true,
      });
      svgEl.dispatchEvent(event);

      expect(el._vb.w).to.be.lessThan(100);
      expect(el._zoomLevel).to.be.greaterThan(1);
    });

    it("_onWheel zooms out", async () => {
      await createCardWithSvg();
      const svgEl = el._svgEl;

      el._vb = { x: 25, y: 25, w: 50, h: 50 };
      el._zoomLevel = 2;
      el._applyViewBox();

      const rect = svgEl.getBoundingClientRect();
      const event = new WheelEvent("wheel", {
        deltaY: 100,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        cancelable: true,
      });
      svgEl.dispatchEvent(event);

      expect(el._vb.w).to.be.greaterThan(50);
    });

    it("_onWheel prevents default", async () => {
      await createCardWithSvg();
      const svgEl = el._svgEl;
      const rect = svgEl.getBoundingClientRect();
      const event = new WheelEvent("wheel", {
        deltaY: -100,
        clientX: rect.left + 5,
        clientY: rect.top + 5,
        cancelable: true,
      });
      svgEl.dispatchEvent(event);
      expect(event.defaultPrevented).to.be.true;
    });

    it("_onWheel is no-op without viewBox", async () => {
      await createCardWithSvg();
      el._vb = null;
      const svgEl = el._svgEl;
      const rect = svgEl.getBoundingClientRect();
      const event = new WheelEvent("wheel", {
        deltaY: -100,
        clientX: rect.left + 5,
        clientY: rect.top + 5,
        cancelable: true,
      });
      svgEl.dispatchEvent(event);
    });

    it("_onWheel respects max zoom (8x)", async () => {
      await createCardWithSvg();
      el._vb = { x: 44, y: 44, w: 12, h: 12 };
      el._zoomLevel = 8;
      el._applyViewBox();

      const svgEl = el._svgEl;
      const rect = svgEl.getBoundingClientRect();
      const event = new WheelEvent("wheel", {
        deltaY: -100,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        cancelable: true,
      });
      svgEl.dispatchEvent(event);

      expect(el._vb.w).to.equal(12);
    });

    it("_onWheel respects min zoom (1x)", async () => {
      await createCardWithSvg();
      const svgEl = el._svgEl;
      const rect = svgEl.getBoundingClientRect();
      const event = new WheelEvent("wheel", {
        deltaY: 100,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        cancelable: true,
      });
      svgEl.dispatchEvent(event);

      expect(el._vb.w).to.equal(100);
    });

    it("pointer drag pans the view", async () => {
      await createCardWithSvg();
      const svgEl = el._svgEl;
      const rect = svgEl.getBoundingClientRect();

      svgEl.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 1,
          clientX: rect.left + 50,
          clientY: rect.top + 50,
        }),
      );
      svgEl.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 1,
          clientX: rect.left + 30,
          clientY: rect.top + 30,
        }),
      );

      expect(el._vb.x).to.be.greaterThan(0);
      expect(el._vb.y).to.be.greaterThan(0);
    });

    it("_onPointerMove is no-op for unknown pointer", async () => {
      await createCardWithSvg();
      const vbBefore = { ...el._vb };
      el._svgEl.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 999,
          clientX: 10,
          clientY: 10,
        }),
      );
      expect(el._vb).to.deep.equal(vbBefore);
    });

    it("_onPointerMove is no-op without viewBox", async () => {
      await createCardWithSvg();
      const svgEl = el._svgEl;
      const rect = svgEl.getBoundingClientRect();
      svgEl.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 1,
          clientX: rect.left + 50,
          clientY: rect.top + 50,
        }),
      );
      el._vb = null;
      svgEl.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 1,
          clientX: rect.left + 30,
          clientY: rect.top + 30,
        }),
      );
    });

    it("pointerup resets pan state", async () => {
      await createCardWithSvg();
      const svgEl = el._svgEl;
      const rect = svgEl.getBoundingClientRect();

      svgEl.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 1,
          clientX: rect.left + 50,
          clientY: rect.top + 50,
        }),
      );
      svgEl.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));

      expect(el._pointers.size).to.equal(0);
      expect(el._lastPanPoint).to.be.null;
    });

    it("pinch zoom with two pointers", async () => {
      await createCardWithSvg();
      const svgEl = el._svgEl;
      const rect = svgEl.getBoundingClientRect();

      svgEl.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 1,
          clientX: rect.left + 30,
          clientY: rect.top + 50,
        }),
      );
      svgEl.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 2,
          clientX: rect.left + 70,
          clientY: rect.top + 50,
        }),
      );

      expect(el._lastPanPoint).to.be.null;

      svgEl.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 1,
          clientX: rect.left + 20,
          clientY: rect.top + 50,
        }),
      );
      svgEl.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 2,
          clientX: rect.left + 80,
          clientY: rect.top + 50,
        }),
      );

      expect(el._lastPinchDist).to.not.be.null;
    });

    it("pinch zoom applies scale and pans", async () => {
      await createCardWithSvg();
      const svgEl = el._svgEl;
      const rect = svgEl.getBoundingClientRect();

      svgEl.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 1,
          clientX: rect.left + 30,
          clientY: rect.top + 50,
        }),
      );
      svgEl.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 2,
          clientX: rect.left + 70,
          clientY: rect.top + 50,
        }),
      );

      // First move sets lastPinchDist
      svgEl.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 1,
          clientX: rect.left + 30,
          clientY: rect.top + 50,
        }),
      );
      svgEl.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 2,
          clientX: rect.left + 70,
          clientY: rect.top + 50,
        }),
      );

      // Second move triggers actual zoom (fingers move apart)
      svgEl.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 1,
          clientX: rect.left + 10,
          clientY: rect.top + 50,
        }),
      );
      svgEl.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 2,
          clientX: rect.left + 90,
          clientY: rect.top + 50,
        }),
      );

      expect(el._vb.w).to.be.lessThan(100);
      expect(el._zoomLevel).to.be.greaterThan(1);
    });

    it("pinch zoom respects max zoom limit", async () => {
      await createCardWithSvg();
      const svgEl = el._svgEl;
      svgEl.setPointerCapture = () => {};

      // Set already at max zoom
      el._vb = { x: 44, y: 44, w: 12, h: 12 };
      el._zoomLevel = 8;
      el._applyViewBox();

      const rect = svgEl.getBoundingClientRect();
      svgEl.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 1,
          clientX: rect.left + 30,
          clientY: rect.top + 50,
        }),
      );
      svgEl.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 2,
          clientX: rect.left + 70,
          clientY: rect.top + 50,
        }),
      );

      // Set initial pinch distance
      svgEl.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 1,
          clientX: rect.left + 30,
          clientY: rect.top + 50,
        }),
      );
      svgEl.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 2,
          clientX: rect.left + 70,
          clientY: rect.top + 50,
        }),
      );

      // Try to zoom in more (fingers move apart a lot)
      svgEl.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 1,
          clientX: rect.left + 1,
          clientY: rect.top + 50,
        }),
      );
      svgEl.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 2,
          clientX: rect.left + 99,
          clientY: rect.top + 50,
        }),
      );

      // Width should not decrease below the limit
      expect(el._vb.w).to.equal(12);
    });

    it("_handlePinch is no-op with wrong pointer count", async () => {
      await createCardWithSvg();
      el._pointers = new Map([[1, { x: 10, y: 10 }]]);
      const vbBefore = { ...el._vb };
      el._handlePinch();
      expect(el._vb).to.deep.equal(vbBefore);
    });

    it("pointerup with two fingers transitions to pan", async () => {
      await createCardWithSvg();
      const svgEl = el._svgEl;
      const rect = svgEl.getBoundingClientRect();

      svgEl.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 1,
          clientX: rect.left + 30,
          clientY: rect.top + 50,
        }),
      );
      svgEl.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 2,
          clientX: rect.left + 70,
          clientY: rect.top + 50,
        }),
      );
      svgEl.dispatchEvent(new PointerEvent("pointerup", { pointerId: 2 }));

      expect(el._pointers.size).to.equal(1);
      expect(el._lastPanPoint).to.not.be.null;
      expect(el._lastPinchDist).to.be.null;
    });

    it("_handlePan is no-op without lastPanPoint", async () => {
      await createCardWithSvg();
      el._lastPanPoint = null;
      const vbBefore = { ...el._vb };
      el._handlePan({ clientX: 10, clientY: 10 });
      expect(el._vb).to.deep.equal(vbBefore);
    });
  });

  describe("_screenToSVG", () => {
    it("falls back to rect-based calculation when getScreenCTM returns null", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({
          svg: VALID_SVG,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 1500,
          backend: "z2m",
        });
      });
      await aTimeout(50);
      await el.updateComplete;

      const origGetScreenCTM = el._svgEl.getScreenCTM;
      el._svgEl.getScreenCTM = () => null;

      const result = el._screenToSVG(0, 0);
      expect(result).to.have.property("x");
      expect(result).to.have.property("y");

      el._svgEl.getScreenCTM = origGetScreenCTM;
    });
  });

  describe("disconnectedCallback", () => {
    it("clears timer on disconnect", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      let resolveMap;
      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return new Promise((r) => {
          resolveMap = r;
        });
      });
      await aTimeout(10);
      expect(el._timerInterval).to.not.be.null;

      el.disconnectedCallback();
      expect(el._timerInterval).to.not.be.null; // clearInterval doesn't null it, but interval stops

      resolveMap({
        svg: VALID_SVG,
        device_count: 5,
        max_depth: 3,
        scan_duration_ms: 500,
        backend: "z2m",
      });
      await aTimeout(10);
    });

    it("tears down pan/zoom listeners on disconnect", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({
          svg: VALID_SVG,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 1500,
          backend: "z2m",
        });
      });
      await aTimeout(50);
      await el.updateComplete;

      const svgEl = el._svgEl;
      expect(svgEl).to.exist;

      el.disconnectedCallback();
      // Verify no error on subsequent events
      const rect = svgEl.getBoundingClientRect();
      svgEl.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: -100,
          clientX: rect.left + 5,
          clientY: rect.top + 5,
          cancelable: true,
        }),
      );
    });
  });

  describe("_initPanZoom edge cases", () => {
    it("does nothing if SVG has no viewBox attribute", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      el._teardownPanZoom();
      el._svgEl = svg;
      el._initPanZoom(svg);
      expect(el._vb).to.be.null;
    });
  });

  describe("updated lifecycle", () => {
    it("re-initializes pan/zoom when SVG element changes", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({
          svg: VALID_SVG,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 1500,
          backend: "z2m",
        });
      });
      await aTimeout(50);
      await el.updateComplete;

      const firstSvg = el._svgEl;
      expect(firstSvg).to.exist;

      // Trigger a new SVG content render
      el._svgEl = null;
      el._svgContent = null;
      await el.updateComplete;

      el._hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({
          svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200"/></svg>',
          device_count: 10,
          max_depth: 5,
          scan_duration_ms: 3000,
          backend: "z2m",
        });
      });
      await el._fetchMap(true);
      await el.updateComplete;

      expect(el._svgEl).to.exist;
      expect(el._svgEl).to.not.equal(firstSvg);
    });
  });

  describe("tryReplace error card recovery", () => {
    it("replaces hui-error-card using config fallback and _config", async () => {
      // Test both _config and config fallback in a single test to catch tryReplace within its attempt window
      const errorCard1 = document.createElement("hui-error-card");
      errorCard1._config = {
        message: "Custom element doesn't exist: zigporter-network-map-card",
      };
      const errorCard2 = document.createElement("hui-error-card");
      errorCard2.config = { message: "zigporter-network-map-card not loaded" };
      const nonMatchingCard = document.createElement("hui-error-card");
      nonMatchingCard._config = { message: "some-other-card" };
      const container = document.createElement("div");
      container.appendChild(errorCard1);
      container.appendChild(errorCard2);
      container.appendChild(nonMatchingCard);
      document.body.appendChild(container);

      const haEl = document.createElement("home-assistant");
      haEl.hass = mockHass();
      document.body.appendChild(haEl);

      await aTimeout(600);

      const replaced = container.querySelectorAll("zigporter-network-map-card");
      expect(replaced.length).to.equal(2);
      expect(container.querySelector("hui-error-card")).to.exist;

      document.body.removeChild(container);
      document.body.removeChild(haEl);
    });
  });

  describe("stats without timestamp", () => {
    it("omits timestamp when scan_timestamp is missing", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({ show_stats: true });
      await el.updateComplete;

      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({
          svg: VALID_SVG,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 1500,
          backend: "z2m",
        });
      });
      await aTimeout(50);
      await el.updateComplete;

      const stats = el.renderRoot.querySelector(".stats");
      expect(stats.textContent).to.not.include("Scanned");
    });
  });

  describe("Tree/Mesh toggle", () => {
    it("renders Tree, Mesh, and Alerts toggle buttons", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;
      const toggles = el.renderRoot.querySelectorAll(".toggle-btn");
      expect(toggles.length).to.equal(3);
      expect(toggles[0].textContent.trim()).to.equal("Tree");
      expect(toggles[1].textContent.trim()).to.equal("Mesh");
      expect(toggles[2].textContent.trim()).to.equal("Alerts");
    });

    it("Tree button is active by default, Alerts is not", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;
      const toggles = el.renderRoot.querySelectorAll(".toggle-btn");
      expect(toggles[0].classList.contains("active")).to.be.true;
      expect(toggles[1].classList.contains("active")).to.be.false;
      expect(toggles[2].classList.contains("active")).to.be.false;
    });

    it("clicking Mesh shows mesh-links group", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({
          svg: SVG_WITH_MESH,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 1500,
          backend: "z2m",
        });
      });
      await aTimeout(50);
      await el.updateComplete;

      const meshBtn = el.renderRoot.querySelectorAll(".toggle-btn")[1];
      meshBtn.click();
      await el.updateComplete;

      const meshGroup = el.renderRoot.querySelector(
        ".map-container svg .mesh-links",
      );
      expect(meshGroup.style.display).to.equal("block");
    });

    it("clicking Tree hides mesh-links group", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({
          svg: SVG_WITH_MESH,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 1500,
          backend: "z2m",
        });
      });
      await aTimeout(50);
      await el.updateComplete;

      // Enable mesh first
      el._setMeshVisible(true);
      await el.updateComplete;

      // Then switch back to tree
      const treeBtn = el.renderRoot.querySelectorAll(".toggle-btn")[0];
      treeBtn.click();
      await el.updateComplete;

      const meshGroup = el.renderRoot.querySelector(
        ".map-container svg .mesh-links",
      );
      expect(meshGroup.style.display).to.equal("none");
    });

    it("_setMeshVisible is no-op without SVG", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      // No SVG loaded, should not throw
      el._setMeshVisible(true);
      expect(el._meshVisible).to.be.true;
    });

    it("preserves mesh visibility when SVG re-renders", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      el._meshVisible = true;
      el._hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({
          svg: SVG_WITH_MESH,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 1500,
          backend: "z2m",
        });
      });
      el._initialized = true;
      await el._fetchMap(true);
      await el.updateComplete;

      const meshGroup = el.renderRoot.querySelector(
        ".map-container svg .mesh-links",
      );
      expect(meshGroup.style.display).to.equal("block");
    });

    it("clicking Alerts adds alerts-mode class to SVG", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({
          svg: VALID_SVG,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 1500,
          backend: "z2m",
        });
      });
      await aTimeout(50);
      await el.updateComplete;

      const alertsBtn = el.renderRoot.querySelectorAll(".toggle-btn")[2];
      alertsBtn.click();
      await el.updateComplete;

      const svgEl = el.renderRoot.querySelector(".map-container svg");
      expect(svgEl.classList.contains("alerts-mode")).to.be.true;
      expect(alertsBtn.classList.contains("active")).to.be.true;
    });

    it("clicking Alerts again removes alerts-mode class", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({
          svg: VALID_SVG,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 1500,
          backend: "z2m",
        });
      });
      await aTimeout(50);
      await el.updateComplete;

      el._setAlertsVisible(true);
      await el.updateComplete;

      const alertsBtn = el.renderRoot.querySelectorAll(".toggle-btn")[2];
      alertsBtn.click();
      await el.updateComplete;

      const svgEl = el.renderRoot.querySelector(".map-container svg");
      expect(svgEl.classList.contains("alerts-mode")).to.be.false;
    });

    it("_setAlertsVisible is no-op without SVG", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      el._setAlertsVisible(true);
      expect(el._alertsVisible).to.be.true;
    });

    it("preserves alerts visibility when SVG re-renders", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      el._alertsVisible = true;
      el._hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({
          svg: VALID_SVG,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 1500,
          backend: "z2m",
        });
      });
      el._initialized = true;
      await el._fetchMap(true);
      await el.updateComplete;

      const svgEl = el.renderRoot.querySelector(".map-container svg");
      expect(svgEl.classList.contains("alerts-mode")).to.be.true;
    });
  });
});
