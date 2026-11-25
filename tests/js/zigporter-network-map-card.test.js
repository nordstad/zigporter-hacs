import {
  fixture,
  html,
  expect,
  aTimeout,
  oneEvent,
  waitUntil,
} from "@open-wc/testing";
import "../../custom_components/zigporter/static/zigporter-network-map-card.js";

const VALID_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
const SVG_WITH_MESH =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><g class="mesh-links" style="display:none"><line x1="0" y1="0" x2="100" y2="100" stroke="#94a3b8"/></g><circle cx="50" cy="50" r="40"/></svg>';
const SVG_NO_VIEWBOX =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="200" height="150"/></svg>';
const SVG_WITH_NODES =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000"><circle cx="500" cy="500" r="28" data-name="Coordinator"/><circle cx="300" cy="200" r="20" data-name="Kitchen Light"/><circle cx="700" cy="800" r="20" data-name="Kitchen Motion"/><circle cx="100" cy="900" r="14" data-name="Bedroom Sensor"/></svg>';
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

    it("explains when a non-admin user is rejected", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;

      el.hass = mockHass(() =>
        Promise.reject({ code: "unauthorized", message: "Unauthorized" }),
      );
      await aTimeout(50);
      await el.updateComplete;

      expect(el._error).to.equal(
        "Administrator access required to view the network map",
      );
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
      expect(buttons.length).to.equal(7);
      expect(buttons[0].textContent.trim()).to.equal("Search");
      expect(buttons[1].textContent.trim()).to.equal("Help");
      expect(buttons[2].textContent.trim()).to.equal("+");
      expect(buttons[3].textContent.trim()).to.equal("−");
      expect(buttons[4].textContent.trim()).to.equal("Reset");
      expect(buttons[5].textContent.trim()).to.equal("Scan");
      expect(buttons[6].textContent.trim()).to.equal("History");
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

    it("shows elapsed timer during loading", async function () {
      this.timeout(6000);
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
      await waitUntil(
        () => el._elapsed >= 1,
        "elapsed timer did not increment",
        {
          timeout: 5000,
          interval: 100,
        },
      );
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

    it("_onWheel zooms on ctrlKey (pinch gesture)", async () => {
      await createCardWithSvg();
      const svgEl = el._svgEl;
      const rect = svgEl.getBoundingClientRect();
      const event = new WheelEvent("wheel", {
        deltaY: -50,
        ctrlKey: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        cancelable: true,
      });
      svgEl.dispatchEvent(event);
      expect(el._zoomLevel).to.be.greaterThan(1);
    });

    it("_onWheel always zooms, even for small deltas", async () => {
      await createCardWithSvg();
      const rect = el._svgEl.getBoundingClientRect();
      const event = new WheelEvent("wheel", {
        deltaY: -10,
        deltaX: 5,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        cancelable: true,
      });
      el._svgEl.dispatchEvent(event);
      expect(el._zoomLevel).to.be.greaterThan(1);
    });

    it("_onWheel handles line and page delta modes and clamps big deltas", async () => {
      await createCardWithSvg();
      const rect = el._svgEl.getBoundingClientRect();
      const wheel = (init) =>
        el._svgEl.dispatchEvent(
          new WheelEvent("wheel", {
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
            cancelable: true,
            ...init,
          }),
        );
      wheel({ deltaY: -3, deltaMode: 1 });
      const afterLines = el._vb.w;
      expect(afterLines).to.be.lessThan(100);
      el._resetView();
      wheel({ deltaY: -1, deltaMode: 2 });
      const afterPage = el._vb.w;
      el._resetView();
      wheel({ deltaY: -100000 });
      expect(el._vb.w).to.be.closeTo(afterPage, 1e-6);
    });

    it("_onWheel keeps the point under the cursor fixed", async () => {
      await createCardWithSvg();
      const rect = el._svgEl.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.3;
      const cy = rect.top + rect.height * 0.6;
      const before = el._screenToSVG(cx, cy);
      el._svgEl.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: -100,
          clientX: cx,
          clientY: cy,
          cancelable: true,
        }),
      );
      const after = el._screenToSVG(cx, cy);
      expect(after.x).to.be.closeTo(before.x, 0.1);
      expect(after.y).to.be.closeTo(before.y, 0.1);
    });

    it("_zoomBy zooms in centered on current view", async () => {
      await createCardWithSvg();
      const cx = el._vb.x + el._vb.w / 2;
      const cy = el._vb.y + el._vb.h / 2;
      el._zoomBy(0.7);
      expect(el._vb.w).to.be.lessThan(100);
      expect(el._zoomLevel).to.be.greaterThan(1);
      expect(el._vb.x + el._vb.w / 2).to.be.closeTo(cx, 0.01);
      expect(el._vb.y + el._vb.h / 2).to.be.closeTo(cy, 0.01);
    });

    it("_zoomBy zooms out", async () => {
      await createCardWithSvg();
      el._vb = { x: 25, y: 25, w: 50, h: 50 };
      el._zoomLevel = 2;
      el._zoomBy(1 / 0.7);
      expect(el._vb.w).to.be.greaterThan(50);
    });

    it("_zoomBy respects max zoom", async () => {
      await createCardWithSvg();
      el._vb = { x: 44, y: 44, w: 12, h: 12 };
      el._zoomLevel = 8;
      el._zoomBy(0.7);
      expect(el._vb.w).to.equal(12);
    });

    it("_zoomBy respects min zoom", async () => {
      await createCardWithSvg();
      el._zoomBy(1 / 0.7);
      expect(el._vb.w).to.equal(100);
    });

    it("_zoomBy is no-op without viewBox", async () => {
      await createCardWithSvg();
      el._vb = null;
      el._zoomBy(0.7);
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

  describe("search", () => {
    async function createCardWithNodes() {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;
      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({
          svg: SVG_WITH_NODES,
          device_count: 4,
          max_depth: 2,
          scan_duration_ms: 500,
          backend: "z2m",
        });
      });
      await el.updateComplete;
      await aTimeout(50);
      await el.updateComplete;
      return el;
    }

    it("toggleSearch opens search input and extracts device names", async () => {
      const el = await createCardWithNodes();
      el._toggleSearch();
      await el.updateComplete;
      const input = el.renderRoot.querySelector(".search-input");
      expect(input).to.exist;
      expect(el._deviceNames).to.include("Kitchen Light");
      expect(el._deviceNames).to.include("Kitchen Motion");
      expect(el._deviceNames).to.include("Bedroom Sensor");
    });

    it("toggleSearch closes search and clears highlight", async () => {
      const el = await createCardWithNodes();
      el._toggleSearch();
      await el.updateComplete;
      el._toggleSearch();
      await el.updateComplete;
      expect(el._searchOpen).to.be.false;
      expect(el._searchQuery).to.equal("");
      const input = el.renderRoot.querySelector(".search-input");
      expect(input).to.not.exist;
    });

    it("onSearchInput filters device names by substring", async () => {
      const el = await createCardWithNodes();
      el._toggleSearch();
      await el.updateComplete;
      el._onSearchInput({ target: { value: "kitchen" } });
      expect(el._searchResults).to.have.lengthOf(2);
      expect(el._searchResults).to.include("Kitchen Light");
      expect(el._searchResults).to.include("Kitchen Motion");
    });

    it("onSearchInput with empty value clears results", async () => {
      const el = await createCardWithNodes();
      el._toggleSearch();
      await el.updateComplete;
      el._onSearchInput({ target: { value: "kitchen" } });
      el._onSearchInput({ target: { value: "" } });
      expect(el._searchResults).to.have.lengthOf(0);
    });

    it("onSearchKeydown ArrowDown increments active index", async () => {
      const el = await createCardWithNodes();
      el._toggleSearch();
      await el.updateComplete;
      el._onSearchInput({ target: { value: "kitchen" } });
      el._onSearchKeydown({
        key: "ArrowDown",
        preventDefault: () => {},
      });
      expect(el._searchActiveIndex).to.equal(0);
      el._onSearchKeydown({
        key: "ArrowDown",
        preventDefault: () => {},
      });
      expect(el._searchActiveIndex).to.equal(1);
    });

    it("onSearchKeydown ArrowUp decrements active index", async () => {
      const el = await createCardWithNodes();
      el._toggleSearch();
      await el.updateComplete;
      el._onSearchInput({ target: { value: "kitchen" } });
      el._searchActiveIndex = 1;
      el._onSearchKeydown({
        key: "ArrowUp",
        preventDefault: () => {},
      });
      expect(el._searchActiveIndex).to.equal(0);
    });

    it("onSearchKeydown Enter selects active result", async () => {
      const el = await createCardWithNodes();
      el._toggleSearch();
      await el.updateComplete;
      el._onSearchInput({ target: { value: "kitchen" } });
      el._searchActiveIndex = 0;
      el._onSearchKeydown({
        key: "Enter",
        preventDefault: () => {},
      });
      expect(el._searchQuery).to.equal(el._searchResults[0] || "Kitchen Light");
    });

    it("onSearchKeydown Escape closes search", async () => {
      const el = await createCardWithNodes();
      el._toggleSearch();
      await el.updateComplete;
      el._onSearchKeydown({ key: "Escape", preventDefault: () => {} });
      expect(el._searchOpen).to.be.false;
    });

    it("selectSearchResult sets query and navigates", async () => {
      const el = await createCardWithNodes();
      el._toggleSearch();
      await el.updateComplete;
      el._selectSearchResult("Kitchen Light");
      expect(el._searchQuery).to.equal("Kitchen Light");
      expect(el._searchResults).to.have.lengthOf(0);
    });

    it("navigateToNode pans and zooms to target", async () => {
      const el = await createCardWithNodes();
      el._toggleSearch();
      await el.updateComplete;
      el._navigateToNode("Kitchen Light");
      expect(el._vb.x).to.be.closeTo(300 - el._vb.w / 2, 1);
      expect(el._vb.y).to.be.closeTo(200 - el._vb.h / 2, 1);
      expect(el._zoomLevel).to.be.greaterThan(1);
    });

    it("navigateToNode does nothing for unknown name", async () => {
      const el = await createCardWithNodes();
      el._toggleSearch();
      await el.updateComplete;
      const vbBefore = { ...el._vb };
      el._navigateToNode("Nonexistent Device");
      expect(el._vb.x).to.equal(vbBefore.x);
    });

    it("highlightNode adds pulse ring", async () => {
      const el = await createCardWithNodes();
      const svg = el.renderRoot.querySelector(".map-container svg");
      const circle = svg.querySelector('circle[data-name="Kitchen Light"]');
      el._highlightNode(circle);
      const ring = svg.querySelector(".search-highlight");
      expect(ring).to.exist;
      expect(ring.getAttribute("cx")).to.equal("300");
      expect(ring.querySelector("animate")).to.exist;
    });

    it("clearHighlight removes all highlights", async () => {
      const el = await createCardWithNodes();
      const svg = el.renderRoot.querySelector(".map-container svg");
      const circle = svg.querySelector('circle[data-name="Kitchen Light"]');
      el._highlightNode(circle);
      el._clearHighlight();
      const ring = svg.querySelector(".search-highlight");
      expect(ring).to.not.exist;
    });

    it("reset clears search state", async () => {
      const el = await createCardWithNodes();
      el._toggleSearch();
      await el.updateComplete;
      el._onSearchInput({ target: { value: "kitchen" } });
      el._selectSearchResult("Kitchen Light");
      el._resetView();
      expect(el._searchOpen).to.be.false;
      expect(el._searchQuery).to.equal("");
      expect(el._searchResults).to.have.lengthOf(0);
    });

    it("onSearchBlur with empty query closes search", async () => {
      const el = await createCardWithNodes();
      el._toggleSearch();
      await el.updateComplete;
      el._onSearchBlur();
      await aTimeout(250);
      expect(el._searchOpen).to.be.false;
    });

    it("onSearchBlur with query only closes dropdown", async () => {
      const el = await createCardWithNodes();
      el._toggleSearch();
      await el.updateComplete;
      el._onSearchInput({ target: { value: "kitchen" } });
      el._onSearchBlur();
      await aTimeout(250);
      expect(el._searchOpen).to.be.true;
      expect(el._searchResults).to.have.lengthOf(0);
    });

    it("renders dropdown items", async () => {
      const el = await createCardWithNodes();
      el._toggleSearch();
      await el.updateComplete;
      el._onSearchInput({ target: { value: "kitchen" } });
      await el.updateComplete;
      const items = el.renderRoot.querySelectorAll(".search-dropdown-item");
      expect(items.length).to.equal(2);
    });

    it("extractDeviceNames does nothing without SVG", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;
      el._extractDeviceNames();
      expect(el._deviceNames).to.have.lengthOf(0);
    });

    it("highlightNode does nothing without SVG", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;
      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      circle.setAttribute("cx", "50");
      circle.setAttribute("cy", "50");
      el._highlightNode(circle);
    });

    it("clearHighlight does nothing without SVG", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;
      el._clearHighlight();
    });

    it("navigateToNode does nothing without vb", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;
      el._vb = null;
      el._navigateToNode("test");
    });

    it("onSearchKeydown ignores unrelated keys", async () => {
      const el = await createCardWithNodes();
      el._toggleSearch();
      await el.updateComplete;
      el._onSearchInput({ target: { value: "kitchen" } });
      el._onSearchKeydown({ key: "a", preventDefault: () => {} });
      expect(el._searchActiveIndex).to.equal(-1);
    });

    it("onSearchKeydown Enter does nothing without active index", async () => {
      const el = await createCardWithNodes();
      el._toggleSearch();
      await el.updateComplete;
      el._onSearchInput({ target: { value: "kitchen" } });
      el._searchActiveIndex = -1;
      el._onSearchKeydown({ key: "Enter", preventDefault: () => {} });
      expect(el._searchQuery).to.equal("kitchen");
    });
  });

  describe("history", () => {
    async function createCard(wsHandler) {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      el.hass = mockHass(wsHandler);
      await aTimeout(50);
      await el.updateComplete;
      return el;
    }

    it("toggleHistory fetches and shows the snapshot list", async () => {
      const snapshots = [
        {
          id: "200",
          scan_timestamp: "2026-01-02T00:00:00Z",
          device_count: 3,
          max_depth: 2,
        },
      ];
      const el = await createCard((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        if (msg.type === "zigporter/history_list")
          return Promise.resolve({ snapshots });
        return Promise.resolve({
          svg: VALID_SVG,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 500,
          backend: "z2m",
        });
      });

      await el._toggleHistory();
      await el.updateComplete;

      expect(el._historyOpen).to.be.true;
      expect(el._historyList).to.deep.equal(snapshots);
      const items = el.renderRoot.querySelectorAll(".history-item");
      expect(items.length).to.equal(1);
      expect(items[0].textContent).to.include("3 devices");
    });

    it("toggleHistory closes without refetching", async () => {
      const el = await createCard();
      el._historyOpen = true;
      el._historyList = [{ id: "1" }];
      await el._toggleHistory();
      expect(el._historyOpen).to.be.false;
    });

    it("toggleHistory shows empty state when no snapshots exist", async () => {
      const el = await createCard((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        if (msg.type === "zigporter/history_list")
          return Promise.resolve({ snapshots: [] });
        return Promise.resolve({ svg: VALID_SVG });
      });

      await el._toggleHistory();
      await el.updateComplete;

      const empty = el.renderRoot.querySelector(".history-empty");
      expect(empty).to.exist;
    });

    it("toggleHistory clears list on WS failure", async () => {
      const el = await createCard((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        if (msg.type === "zigporter/history_list")
          return Promise.reject(new Error("boom"));
        return Promise.resolve({ svg: VALID_SVG });
      });

      await el._toggleHistory();

      expect(el._historyList).to.have.lengthOf(0);
    });

    it("toggleHistory defaults to empty list when snapshots is missing", async () => {
      const el = await createCard((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        if (msg.type === "zigporter/history_list") return Promise.resolve({});
        return Promise.resolve({ svg: VALID_SVG });
      });

      await el._toggleHistory();

      expect(el._historyList).to.have.lengthOf(0);
    });

    it("selectHistorySnapshot loads snapshot and shows banner", async () => {
      const el = await createCard((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        if (msg.type === "zigporter/history_get")
          return Promise.resolve({
            id: "200",
            svg: VALID_SVG,
            device_count: 4,
            max_depth: 2,
            backend: "z2m",
            scan_timestamp: "2026-01-02T00:00:00Z",
          });
        return Promise.resolve({ svg: VALID_SVG });
      });

      await el._selectHistorySnapshot("200");
      await el.updateComplete;

      expect(el._historyOpen).to.be.false;
      expect(el._historySnapshot.id).to.equal("200");
      expect(el._stats).to.include("4 devices");
      const banner = el.renderRoot.querySelector(".history-banner");
      expect(banner).to.exist;
      expect(banner.textContent).to.include("Viewing scan from");
    });

    it("selectHistorySnapshot handles parse failure", async () => {
      const el = await createCard((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        if (msg.type === "zigporter/history_get")
          return Promise.resolve({ svg: INVALID_SVG });
        return Promise.resolve({ svg: VALID_SVG });
      });

      await el._selectHistorySnapshot("bad");

      expect(el._error).to.equal("Failed to parse SVG");
    });

    it("selectHistorySnapshot handles WS error", async () => {
      const el = await createCard((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        if (msg.type === "zigporter/history_get")
          return Promise.reject(new Error("not_found"));
        return Promise.resolve({ svg: VALID_SVG });
      });

      await el._selectHistorySnapshot("missing");

      expect(el._error).to.equal("not_found");
    });

    it("selectHistorySnapshot uses ZHA backend label", async () => {
      const el = await createCard((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        if (msg.type === "zigporter/history_get")
          return Promise.resolve({
            id: "1",
            svg: VALID_SVG,
            device_count: 2,
            max_depth: 1,
            backend: "zha",
            scan_timestamp: "2026-01-01T00:00:00Z",
          });
        return Promise.resolve({ svg: VALID_SVG });
      });

      await el._selectHistorySnapshot("1");

      expect(el._stats).to.include("ZHA");
    });

    it("selectHistorySnapshot falls back to default error message", async () => {
      const el = await createCard((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        if (msg.type === "zigporter/history_get") return Promise.reject({});
        return Promise.resolve({ svg: VALID_SVG });
      });

      await el._selectHistorySnapshot("missing");

      expect(el._error).to.equal("Failed to load snapshot");
    });

    it("selectHistorySnapshot does nothing without hass", async () => {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el._selectHistorySnapshot("1");
      expect(el._historySnapshot).to.be.null;
    });

    it("exitHistoryView clears snapshot and refetches live map", async () => {
      const el = await createCard((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({
          svg: VALID_SVG,
          device_count: 5,
          max_depth: 3,
          scan_duration_ms: 500,
          backend: "z2m",
        });
      });
      el._historySnapshot = { id: "1", scan_timestamp: "2026-01-01T00:00:00Z" };
      await el.updateComplete;

      el._exitHistoryView();
      await aTimeout(50);

      expect(el._historySnapshot).to.be.null;
    });

    it("formatHistoryTimestamp handles missing timestamp", async () => {
      const el = await createCard();
      expect(el._formatHistoryTimestamp(null)).to.equal("unknown time");
    });

    it("formatHistoryTimestamp formats a valid ISO string", async () => {
      const el = await createCard();
      expect(el._formatHistoryTimestamp("2026-01-02T00:00:00Z")).to.equal(
        new Date("2026-01-02T00:00:00Z").toLocaleString(),
      );
    });
  });
  describe("multiple entries (entry_id)", () => {
    const MAP = {
      svg: VALID_SVG,
      device_count: 7,
      max_depth: 2,
      scan_duration_ms: 500,
      backend: "z2m",
      mqtt_topic: "zigbee2mqtt/b2",
      entry_title: "Building 2",
    };

    async function createCard(config, handler) {
      const calls = [];
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig(config);
      await el.updateComplete;
      el.hass = mockHass((msg) => {
        calls.push(msg);
        if (handler) return handler(msg);
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve(MAP);
      });
      await aTimeout(50);
      await el.updateComplete;
      return { el, calls };
    }

    it("sends entry_id with every websocket call when configured", async () => {
      const { el, calls } = await createCard({ entry_id: "abc" });
      await el._toggleHistory();
      await el._selectHistorySnapshot("1");

      const types = calls.map((c) => c.type);
      expect(types).to.include.members([
        "zigporter/scan_status",
        "zigporter/network_map",
        "zigporter/history_list",
        "zigporter/history_get",
      ]);
      expect(calls.every((c) => c.entry_id === "abc")).to.be.true;
    });

    it("does not send entry_id when not configured", async () => {
      const { calls } = await createCard({});
      expect(calls.length).to.be.greaterThan(0);
      expect(calls.some((c) => "entry_id" in c)).to.be.false;
    });

    it("uses the entry name as title when an entry is selected", async () => {
      const { el } = await createCard({ entry_id: "abc" });
      expect(el.renderRoot.querySelector("h2").textContent).to.equal(
        "Building 2",
      );
    });

    it("prefers a custom title over the entry name", async () => {
      const { el } = await createCard({ entry_id: "abc", title: "B2" });
      expect(el.renderRoot.querySelector("h2").textContent).to.equal("B2");
    });

    it("keeps the default title when the entry name is missing", async () => {
      const { el } = await createCard({ entry_id: "abc" }, (msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({ ...MAP, entry_title: undefined });
      });
      expect(el.renderRoot.querySelector("h2").textContent).to.equal(
        "Zigbee Network Map",
      );
    });

    it("does not change the title or stats of cards without entry_id", async () => {
      const { el } = await createCard({});
      expect(el.renderRoot.querySelector("h2").textContent).to.equal(
        "Zigbee Network Map",
      );
      const stats = el.renderRoot.querySelector(".stats").textContent;
      expect(stats).to.include("Z2M · 7 devices");
      expect(stats).to.not.include("zigbee2mqtt/b2");
    });

    it("shows the topic in the stats when an entry is selected", async () => {
      const { el } = await createCard({ entry_id: "abc" });
      expect(el.renderRoot.querySelector(".stats").textContent).to.include(
        "Z2M · zigbee2mqtt/b2 · 7 devices",
      );
    });

    it("shows no topic for ZHA entries", async () => {
      const { el } = await createCard({ entry_id: "abc" }, (msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({ ...MAP, backend: "zha", mqtt_topic: null });
      });
      expect(el.renderRoot.querySelector(".stats").textContent).to.include(
        "ZHA · 7 devices",
      );
    });

    it("shows the topic when viewing a history snapshot", async () => {
      const { el } = await createCard({ entry_id: "abc" }, (msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve(MAP);
      });
      await el._selectHistorySnapshot("1");
      expect(el._stats).to.include("Z2M · zigbee2mqtt/b2 · 7 devices");
    });

    it("keeps two cards independent", async () => {
      const a = await createCard({ entry_id: "a" });
      const b = await createCard({ entry_id: "b" });
      expect(a.calls.every((c) => c.entry_id === "a")).to.be.true;
      expect(b.calls.every((c) => c.entry_id === "b")).to.be.true;
    });
  });

  describe("node tap and popup", () => {
    const DEVICE_A = "a".repeat(32);
    const SVG_WITH_NODE_DATA =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">' +
      '<circle cx="50" cy="50" r="10" data-name="Coordinator" data-ieee="0xc0" data-type="Coordinator"/>' +
      '<circle cx="20" cy="20" r="6" data-name="Lamp" data-ieee="0xa1" data-type="Router" data-lqi="120" data-depth="1" data-parent="Coordinator"/>' +
      '<circle cx="80" cy="80" r="6" data-name="Old Sensor"/>' +
      '<circle cx="80" cy="20" r="6" data-name="Near" data-ieee="0xn1" data-type="EndDevice"/>' +
      '<circle cx="84" cy="20" r="6" data-name="Far" data-ieee="0xn2" data-type="EndDevice"/>' +
      "</svg>";

    async function createCard(devices = { "0xa1": DEVICE_A }, extra = {}) {
      const el = await fixture(
        html`<zigporter-network-map-card></zigporter-network-map-card>`,
      );
      el.setConfig({});
      await el.updateComplete;
      el.hass = mockHass((msg) => {
        if (msg.type === "zigporter/scan_status")
          return Promise.resolve({ scanning: false });
        return Promise.resolve({
          svg: SVG_WITH_NODE_DATA,
          devices,
          device_count: 3,
          max_depth: 1,
          scan_duration_ms: 100,
          backend: "z2m",
          ...extra,
        });
      });
      await aTimeout(50);
      await el.updateComplete;
      el._svgEl.setPointerCapture = () => {};
      return el;
    }

    function pointAt(el, x, y) {
      const rect = el._svgEl.getBoundingClientRect();
      const ctm = el._svgEl.getScreenCTM();
      if (ctm) return { x: ctm.a * x + ctm.e, y: ctm.d * y + ctm.f };
      return { x: rect.left + x, y: rect.top + y };
    }

    function fire(el, type, init) {
      el._svgEl.dispatchEvent(
        new PointerEvent(type, { pointerId: 1, bubbles: true, ...init }),
      );
    }

    function tap(el, x, y) {
      const p = pointAt(el, x, y);
      fire(el, "pointerdown", { clientX: p.x, clientY: p.y });
      fire(el, "pointerup", { clientX: p.x, clientY: p.y });
    }

    it("tap on a node selects it with its device id", async () => {
      const el = await createCard();
      tap(el, 20, 20);
      expect(el._selectedNode.name).to.equal("Lamp");
      expect(el._selectedNode.deviceId).to.equal(DEVICE_A);
      expect(el._selectedNode.parent).to.equal("Coordinator");
    });

    it("tap on empty space clears the selection", async () => {
      const el = await createCard();
      tap(el, 20, 20);
      expect(el._selectedNode).to.not.be.null;
      tap(el, 5, 95);
      expect(el._selectedNode).to.be.null;
    });

    it("drag does not open the popup", async () => {
      const el = await createCard();
      const p = pointAt(el, 20, 20);
      fire(el, "pointerdown", { clientX: p.x, clientY: p.y });
      fire(el, "pointermove", { clientX: p.x + 30, clientY: p.y });
      fire(el, "pointerup", { clientX: p.x + 30, clientY: p.y });
      expect(el._selectedNode).to.be.null;
    });

    it("pinch does not open the popup", async () => {
      const el = await createCard();
      const p = pointAt(el, 20, 20);
      fire(el, "pointerdown", { clientX: p.x, clientY: p.y });
      fire(el, "pointerdown", {
        pointerId: 2,
        clientX: p.x + 50,
        clientY: p.y,
      });
      fire(el, "pointerup", { clientX: p.x, clientY: p.y });
      fire(el, "pointerup", { pointerId: 2, clientX: p.x + 50, clientY: p.y });
      expect(el._selectedNode).to.be.null;
    });

    it("pointercancel does not open the popup", async () => {
      const el = await createCard();
      const p = pointAt(el, 20, 20);
      fire(el, "pointerdown", { clientX: p.x, clientY: p.y });
      fire(el, "pointercancel", { clientX: p.x, clientY: p.y });
      expect(el._selectedNode).to.be.null;
    });

    it("long press does not open the popup", async () => {
      const el = await createCard();
      const p = pointAt(el, 20, 20);
      fire(el, "pointerdown", { clientX: p.x, clientY: p.y });
      await aTimeout(550);
      fire(el, "pointerup", { clientX: p.x, clientY: p.y });
      expect(el._selectedNode).to.be.null;
    });

    it("pointerup from a different pointer does not open the popup", async () => {
      const el = await createCard();
      const p = pointAt(el, 20, 20);
      fire(el, "pointerdown", { clientX: p.x, clientY: p.y });
      fire(el, "pointerup", { pointerId: 9, clientX: p.x, clientY: p.y });
      expect(el._selectedNode).to.be.null;
    });

    it("node without data-ieee has no device id", async () => {
      const el = await createCard();
      tap(el, 80, 80);
      expect(el._selectedNode.name).to.equal("Old Sensor");
      expect(el._selectedNode.hasIeee).to.be.false;
      expect(el._selectedNode.deviceId).to.be.null;
    });

    it("invalid device id is rejected", async () => {
      const el = await createCard({ "0xa1": "not-a-valid-id" });
      tap(el, 20, 20);
      expect(el._selectedNode.hasIeee).to.be.true;
      expect(el._selectedNode.deviceId).to.be.null;
    });

    it("closest of two overlapping circles wins", async () => {
      const el = await createCard();
      tap(el, 83, 20);
      expect(el._selectedNode.name).to.equal("Far");
      tap(el, 81, 20);
      expect(el._selectedNode.name).to.equal("Near");
    });

    it("history snapshot replaces devices and clears selection", async () => {
      const el = await createCard();
      tap(el, 20, 20);
      el._hass = mockHass((msg) => {
        if (msg.type === "zigporter/history_get")
          return Promise.resolve({
            id: "1",
            svg: SVG_WITH_NODE_DATA,
            devices: { "0xa1": "b".repeat(32) },
            device_count: 3,
            max_depth: 1,
            backend: "z2m",
          });
        return Promise.resolve({});
      });
      await el._selectHistorySnapshot("1");
      expect(el._devices).to.deep.equal({ "0xa1": "b".repeat(32) });
      expect(el._selectedNode).to.be.null;
    });

    it("history snapshot without devices gives an empty table", async () => {
      const el = await createCard();
      el._hass = mockHass(() =>
        Promise.resolve({ id: "1", svg: SVG_WITH_NODE_DATA, device_count: 1 }),
      );
      await el._selectHistorySnapshot("1");
      expect(el._devices).to.deep.equal({});
    });

    it("selecting a node draws a persistent ring that closing removes", async () => {
      const el = await createCard();
      tap(el, 20, 20);
      await el.updateComplete;
      const ring = el._svgEl.querySelector(".selected-ring");
      expect(ring).to.exist;
      expect(ring.getAttribute("cx")).to.equal("20");
      expect(parseFloat(ring.getAttribute("r"))).to.be.greaterThan(6);
      const before = parseFloat(ring.getAttribute("stroke-width"));
      el._vb = { ...el._vb, w: 50, h: 50 };
      el._applyViewBox();
      const zoomed = el._svgEl.querySelector(".selected-ring");
      expect(parseFloat(zoomed.getAttribute("stroke-width"))).to.be.lessThan(
        before,
      );
      tap(el, 80, 20);
      await el.updateComplete;
      expect(el._svgEl.querySelectorAll(".selected-ring")).to.have.lengthOf(1);
      el._selectedNode = null;
      await el.updateComplete;
      expect(el._svgEl.querySelector(".selected-ring")).to.be.null;
    });

    it("popup without circle position draws no ring", async () => {
      const el = await createCard();
      el._selectedNode = { name: "x", type: "Router", hasIeee: true };
      await el.updateComplete;
      expect(el._svgEl.querySelector(".selected-ring")).to.be.null;
    });

    it("accent colour only accepts hex fills", async () => {
      const el = await createCard();
      tap(el, 20, 20);
      expect(el._selectedNode.color).to.be.null;
      el._svgEl
        .querySelector('[data-name="Lamp"]')
        .setAttribute("fill", "#3b82f6");
      tap(el, 20, 20);
      expect(el._selectedNode.color).to.equal("#3b82f6");
    });

    it("old map popup shows only the rescan note", async () => {
      const el = await createCard();
      tap(el, 80, 80);
      await el.updateComplete;
      const popup = el.renderRoot.querySelector(".node-popup");
      expect(popup.querySelector("dl")).to.be.null;
      expect(popup.textContent).to.include("Run a new scan");
    });

    it("tap lands within a finger-sized margin around a node", async () => {
      const el = await createCard();
      tap(el, 20, 20 + 6 + 3);
      expect(el._selectedNode.name).to.equal("Lamp");
    });

    it("_unitsPerPx falls back to the element rect without a CTM", async () => {
      const el = await createCard();
      el._svgEl.getScreenCTM = () => null;
      const w = el._svgEl.getBoundingClientRect().width;
      expect(el._unitsPerPx()).to.be.closeTo(el._vb.w / w, 1e-9);
    });

    it("pinch zoom keeps the point between the fingers fixed", async () => {
      const el = await createCard();
      const a = pointAt(el, 40, 50);
      const b = pointAt(el, 60, 50);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const before = el._screenToSVG(mid.x, mid.y);
      fire(el, "pointerdown", { pointerId: 1, clientX: a.x, clientY: a.y });
      fire(el, "pointerdown", { pointerId: 2, clientX: b.x, clientY: b.y });
      fire(el, "pointermove", { pointerId: 1, clientX: a.x, clientY: a.y });
      fire(el, "pointermove", {
        pointerId: 1,
        clientX: a.x - 20,
        clientY: a.y,
      });
      fire(el, "pointermove", {
        pointerId: 2,
        clientX: b.x + 20,
        clientY: b.y,
      });
      expect(el._zoomLevel).to.be.greaterThan(1);
      const after = el._screenToSVG(mid.x, mid.y);
      expect(after.x).to.be.closeTo(before.x, 0.5);
      expect(after.y).to.be.closeTo(before.y, 0.5);
    });

    it("tap shows manufacturer and model as separate rows", async () => {
      const el = await createCard(
        { "0xa1": DEVICE_A },
        {
          device_details: {
            "0xa1": { manufacturer: "IKEA", model: "TRADFRI bulb" },
          },
        },
      );
      tap(el, 20, 20);
      await el.updateComplete;
      expect(el._selectedNode.manufacturer).to.equal("IKEA");
      expect(el._selectedNode.model).to.equal("TRADFRI bulb");
      const labels = [...el.renderRoot.querySelectorAll(".node-popup dt")].map(
        (d) => d.textContent,
      );
      expect(labels).to.include("Manufacturer");
      expect(labels).to.include("Model");
      expect(
        el.renderRoot.querySelector(".node-popup").textContent,
      ).to.not.include("·");
    });

    it("detail text handles partial, missing and odd details", async () => {
      const el = await createCard();
      expect(el._detailText({ model: "M" }, "model")).to.equal("M");
      expect(el._detailText({ model: "M" }, "manufacturer")).to.be.null;
      expect(el._detailText({ manufacturer: 5 }, "manufacturer")).to.be.null;
      expect(el._detailText({ model: "" }, "model")).to.be.null;
      expect(el._detailText(null, "model")).to.be.null;
      expect(el._detailText("text", "model")).to.be.null;
    });

    it("a device with only a model shows only the Model row", async () => {
      const el = await createCard(
        { "0xa1": DEVICE_A },
        { device_details: { "0xa1": { model: "TRADFRI bulb" } } },
      );
      tap(el, 20, 20);
      await el.updateComplete;
      const text = el.renderRoot.querySelector(".node-popup").textContent;
      expect(text).to.include("Model");
      expect(text).to.not.include("Manufacturer");
    });

    it("tap without details shows no model row", async () => {
      const el = await createCard();
      tap(el, 20, 20);
      await el.updateComplete;
      expect(el._selectedNode.model).to.be.null;
      expect(
        el.renderRoot.querySelector(".node-popup").textContent,
      ).to.not.include("Model");
    });

    it("an address like __proto__ does not break anything", async () => {
      const el = await createCard();
      el._svgEl
        .querySelector('[data-name="Lamp"]')
        .setAttribute("data-ieee", "__proto__");
      tap(el, 20, 20);
      expect(el._selectedNode.model).to.be.null;
    });

    it("renders model as text, not markup", async () => {
      const evil = "<img src=x onerror=alert(1)>";
      const el = await createCard(
        { "0xa1": DEVICE_A },
        { device_details: { "0xa1": { model: evil } } },
      );
      tap(el, 20, 20);
      await el.updateComplete;
      const popup = el.renderRoot.querySelector(".node-popup");
      expect(popup.querySelector("img")).to.be.null;
      expect(popup.textContent).to.include(evil);
    });

    it("history snapshot replaces device details", async () => {
      const el = await createCard();
      el._hass = mockHass(() =>
        Promise.resolve({
          id: "1",
          svg: SVG_WITH_NODE_DATA,
          device_details: { "0xa1": { model: "Old" } },
        }),
      );
      await el._selectHistorySnapshot("1");
      expect(el._deviceDetails).to.deep.equal({ "0xa1": { model: "Old" } });
    });

    describe("popup", () => {
      async function showPopup(node) {
        const el = await createCard();
        el._selectedNode = node;
        await el.updateComplete;
        return el;
      }
      const text = (el) =>
        el.renderRoot.querySelector(".node-popup").textContent;

      it("shows router details", async () => {
        const el = await showPopup({
          name: "Lamp",
          type: "Router",
          lqi: "120",
          depth: "1",
          parent: "Coordinator",
          hasIeee: true,
          deviceId: DEVICE_A,
        });
        const t = text(el);
        for (const s of ["Lamp", "Router", "120", "1", "Coordinator"])
          expect(t).to.include(s);
      });

      it("coordinator has no LQI row", async () => {
        const el = await showPopup({
          name: "Coordinator",
          type: "Coordinator",
          hasIeee: true,
          deviceId: null,
        });
        expect(text(el)).to.include("Coordinator");
        expect(text(el)).to.not.include("LQI to parent");
      });

      it("labels end devices and unknown types", async () => {
        const el = await showPopup({
          name: "x",
          type: "EndDevice",
          hasIeee: true,
        });
        expect(text(el)).to.include("End device");
        el._selectedNode = { name: "x", type: null, hasIeee: true };
        await el.updateComplete;
        expect(text(el)).to.include("Unknown");
      });

      it("missing values show Unknown", async () => {
        const el = await showPopup({
          name: "x",
          type: "Router",
          lqi: "0",
          depth: null,
          parent: null,
          hasIeee: true,
        });
        expect(text(el).match(/Unknown/g)).to.have.lengthOf(3);
        el._selectedNode = {
          name: "x",
          type: "Router",
          lqi: null,
          hasIeee: true,
        };
        await el.updateComplete;
        expect(text(el).match(/Unknown/g)).to.have.lengthOf(3);
      });

      it("Open device navigates to the device page", async () => {
        const el = await showPopup({
          name: "Lamp",
          type: "Router",
          hasIeee: true,
          deviceId: DEVICE_A,
        });
        const calls = [];
        el._navigate = (path) => calls.push(path);
        el.renderRoot.querySelector(".node-popup-open").click();
        expect(calls).to.deep.equal([`/config/devices/device/${DEVICE_A}`]);
      });

      it("colours LQI like the legend", async () => {
        const el = await showPopup(null);
        const cases = [
          ["120", "lqi-good"],
          ["50", "lqi-good"],
          ["49", "lqi-warn"],
          ["20", "lqi-warn"],
          ["19", "lqi-crit"],
          ["1", "lqi-crit"],
          ["0", ""],
          [null, ""],
          ["abc", ""],
        ];
        for (const [lqi, cls] of cases) {
          el._selectedNode = {
            name: "x",
            type: "Router",
            hasIeee: true,
            lqi,
          };
          await el.updateComplete;
          const dd = el.renderRoot.querySelector(
            ".node-popup dd:nth-of-type(2)",
          );
          expect(dd.className.trim(), String(lqi)).to.equal(cls);
        }
      });

      it("legend and popup follow the configured thresholds", async () => {
        const el = await createCard({}, { warn_lqi: 80, critical_lqi: 30 });
        const legend = el.renderRoot.querySelector(".legend").textContent;
        for (const s of [
          "Weak (<80)",
          "Critical (<30)",
          "LQI ≥ 80",
          "LQI 30–80",
          "LQI < 30",
        ])
          expect(legend).to.include(s);
        const cases = [
          ["80", "lqi-good"],
          ["79", "lqi-warn"],
          ["30", "lqi-warn"],
          ["29", "lqi-crit"],
        ];
        for (const [lqi, cls] of cases) {
          el._selectedNode = { name: "x", type: "Router", hasIeee: true, lqi };
          await el.updateComplete;
          const dd = el.renderRoot.querySelector(
            ".node-popup dd:nth-of-type(2)",
          );
          expect(dd.className.trim(), lqi).to.equal(cls);
        }
      });

      it("history snapshot brings its own thresholds, old ones fall back", async () => {
        const el = await createCard();
        expect(el.renderRoot.querySelector(".legend").textContent).to.include(
          "LQI ≥ 50",
        );
        el._hass = mockHass(() =>
          Promise.resolve({
            id: "1",
            svg: SVG_WITH_NODE_DATA,
            warn_lqi: 90,
            critical_lqi: 40,
          }),
        );
        await el._selectHistorySnapshot("1");
        await el.updateComplete;
        expect(el.renderRoot.querySelector(".legend").textContent).to.include(
          "LQI ≥ 90",
        );
      });

      it("shows a Last seen row for a valid time only", async () => {
        const base = { name: "x", type: "Router", hasIeee: true };
        const el = await showPopup({
          ...base,
          lastSeen: "2026-01-01T12:00:00+00:00",
        });
        expect(text(el)).to.include("Last seen");
        for (const lastSeen of [null, "garbage"]) {
          el._selectedNode = { ...base, lastSeen };
          await el.updateComplete;
          expect(text(el)).to.not.include("Last seen");
        }
      });

      it("tap reads data-last-seen from the node", async () => {
        const el = await showPopup(null);
        el._svgEl
          .querySelector('[data-name="Lamp"]')
          .setAttribute("data-last-seen", "2026-01-01T12:00:00+00:00");
        tap(el, 20, 20);
        expect(el._selectedNode.lastSeen).to.equal("2026-01-01T12:00:00+00:00");
      });

      it("shows a note when no device matches", async () => {
        const el = await showPopup({
          name: "x",
          type: "Router",
          hasIeee: true,
          deviceId: null,
        });
        expect(text(el)).to.include("No matching Home Assistant device");
        expect(el.renderRoot.querySelector(".node-popup-open")).to.be.null;
      });

      it("asks for a new scan on old maps", async () => {
        const el = await showPopup({
          name: "x",
          type: "Router",
          hasIeee: false,
          deviceId: null,
        });
        expect(text(el)).to.include("Run a new scan to link this device");
        expect(el.renderRoot.querySelector(".node-popup-open")).to.be.null;
      });

      it("close button removes the popup", async () => {
        const el = await showPopup({ name: "x", type: "Router" });
        el.renderRoot.querySelector(".node-popup-close").click();
        await el.updateComplete;
        expect(el._selectedNode).to.be.null;
        expect(el.renderRoot.querySelector(".node-popup")).to.be.null;
      });

      it("_resetView closes the popup", async () => {
        const el = await showPopup({ name: "x", type: "Router" });
        el._resetView();
        expect(el._selectedNode).to.be.null;
      });

      it("_navigate pushes state and fires location-changed", async () => {
        const el = await createCard();
        const original = window.history.pushState;
        const pushed = [];
        window.history.pushState = (...args) => pushed.push(args);
        let fired = false;
        const onChange = () => (fired = true);
        window.addEventListener("location-changed", onChange);
        try {
          el._navigate("/x");
        } finally {
          window.history.pushState = original;
          window.removeEventListener("location-changed", onChange);
        }
        expect(pushed).to.have.lengthOf(1);
        expect(pushed[0][2]).to.equal("/x");
        expect(fired).to.be.true;
      });

      it("renders names as text, not markup", async () => {
        const evil = "<img src=x onerror=alert(1)>";
        const el = await showPopup({
          name: evil,
          type: "Router",
          parent: evil,
          hasIeee: true,
        });
        const popup = el.renderRoot.querySelector(".node-popup");
        expect(popup.querySelector("img")).to.be.null;
        expect(popup.textContent).to.include(evil);
      });
    });
  });

  describe("getConfigForm", () => {
    const form = customElements
      .get("zigporter-network-map-card")
      .getConfigForm();

    it("offers title, show_stats and a Zigporter entry picker", () => {
      const names = form.schema.map((f) => f.name);
      expect(names).to.deep.equal(["title", "show_stats", "entry_id"]);
      const entry = form.schema.find((f) => f.name === "entry_id");
      expect(entry.selector.config_entry.integration).to.equal("zigporter");
      expect(entry.required).to.not.be.true;
    });

    it("defaults show_stats to on", () => {
      expect(form.schema.find((f) => f.name === "show_stats").default).to.be
        .true;
    });

    it("provides labels and helper text", () => {
      expect(form.computeLabel({ name: "entry_id" })).to.equal(
        "Zigporter entry",
      );
      expect(form.computeHelper({ name: "entry_id" })).to.include("original");
      expect(form.computeHelper({ name: "show_stats" })).to.equal(undefined);
    });
  });
});
