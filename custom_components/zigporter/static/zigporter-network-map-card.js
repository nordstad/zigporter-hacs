import {
  LitElement,
  html,
  css,
  nothing,
} from "https://cdn.jsdelivr.net/npm/lit@3/+esm";
import { unsafeHTML } from "https://cdn.jsdelivr.net/npm/lit@3/directives/unsafe-html.js/+esm";

class ZigporterNetworkMapCard extends LitElement {
  static properties = {
    _config: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _svgContent: { state: true },
    _stats: { state: true },
    _elapsed: { state: true },
    _buttonsDisabled: { state: true },
    _meshVisible: { state: true },
    _alertsVisible: { state: true },
    _searchOpen: { state: true },
    _searchQuery: { state: true },
    _searchResults: { state: true },
    _searchActiveIndex: { state: true },
  };

  static styles = css`
    :host {
      display: block;
    }
    ha-card {
      overflow: hidden;
    }
    .header {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px 0;
    }
    .header h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 500;
    }
    .stats {
      padding: 0 16px 4px;
      font-size: 12px;
      color: var(--secondary-text-color);
    }
    .map-container {
      width: 100%;
    }
    .map-container svg {
      width: 100%;
      height: calc(100vh - 140px);
      display: block;
      cursor: grab;
      touch-action: none;
    }
    .map-container svg:active {
      cursor: grabbing;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 16px 32px;
      padding: 10px 16px;
      font-size: 13px;
      color: var(--secondary-text-color);
      border-top: 1px solid var(--divider-color, #333);
    }
    .legend-section {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 14px;
      align-items: center;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .legend-dot.warn {
      box-shadow: 0 0 4px #f59e0b;
      border: 1.5px solid #f59e0b;
    }
    .legend-dot.crit {
      box-shadow: 0 0 4px #ef4444;
      border: 1.5px solid #ef4444;
    }
    .legend-line {
      width: 18px;
      height: 2px;
      flex-shrink: 0;
      border-radius: 1px;
    }
    .status {
      padding: 48px 24px;
      text-align: center;
      color: var(--secondary-text-color);
    }
    .error {
      color: var(--error-color);
    }
    .spinner {
      width: 32px;
      height: 32px;
      margin: 0 auto 16px;
      border: 3px solid var(--divider-color, #444);
      border-top-color: var(--primary-color);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    .timer {
      font-size: 12px;
      margin-top: 8px;
      opacity: 0.7;
    }
    .btn-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .action-btn {
      background: none;
      border: 1px solid var(--divider-color, #444);
      border-radius: 4px;
      cursor: pointer;
      color: var(--primary-text-color);
      padding: 4px 12px;
      font-size: 13px;
      font-weight: 500;
    }
    .action-btn:hover {
      background: var(--secondary-background-color);
    }
    .action-btn:disabled {
      opacity: 0.3;
      cursor: default;
    }
    a.action-btn {
      text-decoration: none;
    }
    .toggle-btn {
      background: none;
      border: 1px solid var(--divider-color, #444);
      border-radius: 4px;
      cursor: pointer;
      color: var(--secondary-text-color);
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 500;
    }
    .toggle-btn.active {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      border-color: var(--primary-color);
    }
    .search-input {
      flex: 1;
      background: none;
      border: 1px solid var(--divider-color, #444);
      border-radius: 4px;
      color: var(--primary-text-color);
      font-size: 14px;
      padding: 4px 8px;
      outline: none;
      min-width: 0;
    }
    .search-input:focus {
      border-color: var(--primary-color);
    }
    .search-dropdown {
      position: absolute;
      top: 100%;
      left: 16px;
      right: 16px;
      background: var(--card-background-color, #1e1e1e);
      border: 1px solid var(--divider-color, #444);
      border-radius: 4px;
      max-height: 200px;
      overflow-y: auto;
      z-index: 10;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }
    .search-dropdown-item {
      padding: 8px 12px;
      cursor: pointer;
      font-size: 13px;
      color: var(--primary-text-color);
    }
    .search-dropdown-item:hover,
    .search-dropdown-item.active {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
  `;

  static getStubConfig() {
    return { title: "Zigbee Network Map", show_stats: true };
  }

  constructor() {
    super();
    this._loading = false;
    this._error = null;
    this._svgContent = null;
    this._stats = null;
    this._elapsed = 0;
    this._buttonsDisabled = false;
    this._meshVisible = false;
    this._alertsVisible = false;
    this._initialized = false;
    this._hass = null;
    this._svgEl = null;
    this._vb = null;
    this._vbInitial = null;
    this._zoomLevel = 1;
    this._pointers = new Map();
    this._lastPanPoint = null;
    this._lastPinchDist = null;
    this._lastPinchMid = null;
    this._timerInterval = null;
    this._searchOpen = false;
    this._searchQuery = "";
    this._searchResults = [];
    this._searchActiveIndex = -1;
    this._deviceNames = [];

    this._boundOnWheel = (e) => this._onWheel(e);
    this._boundOnPointerDown = (e) => this._onPointerDown(e);
    this._boundOnPointerMove = (e) => this._onPointerMove(e);
    this._boundOnPointerUp = (e) => this._onPointerUp(e);
  }

  setConfig(config) {
    this._config = {
      title: (config && config.title) || "Zigbee Network Map",
      show_stats: !config || config.show_stats !== false,
    };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialized && hass) {
      this._initialized = true;
      this._fetchMap(false);
    }
  }

  getCardSize() {
    return 6;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._timerInterval) clearInterval(this._timerInterval);
    this._teardownPanZoom();
  }

  updated(changedProps) {
    if (changedProps.has("_svgContent") && this._svgContent) {
      const svgEl = this.renderRoot.querySelector(".map-container svg");
      if (svgEl && svgEl !== this._svgEl) {
        this._teardownPanZoom();
        this._svgEl = svgEl;
        this._initPanZoom(svgEl);
        this._extractDeviceNames();
        if (this._meshVisible) {
          const meshGroup = svgEl.querySelector(".mesh-links");
          if (meshGroup) meshGroup.style.display = "block";
        }
        if (this._alertsVisible) {
          svgEl.classList.add("alerts-mode");
        }
      }
    }
  }

  render() {
    if (!this._config) return nothing;

    return html`
      <ha-card>
        ${this._renderHeader()}
        ${this._config.show_stats && this._stats
          ? html`<div class="stats">${this._stats}</div>`
          : nothing}
        ${this._renderLegend()}
        <div class="map-container">
          ${this._loading
            ? this._renderLoading()
            : this._error
              ? this._renderError()
              : this._renderMap()}
        </div>
      </ha-card>
    `;
  }

  _renderHeader() {
    return html`
      <div class="header">
        ${this._searchOpen
          ? html`<input
              class="search-input"
              type="text"
              placeholder="Search devices…"
              .value=${this._searchQuery}
              @input=${this._onSearchInput}
              @keydown=${this._onSearchKeydown}
              @blur=${this._onSearchBlur}
            />`
          : html`<h2>${this._config.title}</h2>`}
        <div class="btn-group">
          <button
            class="action-btn"
            title="Search"
            @click=${this._toggleSearch}
          >
            Search
          </button>
          <button
            class="toggle-btn ${!this._meshVisible ? "active" : ""}"
            @click=${() => this._setMeshVisible(false)}
          >
            Tree
          </button>
          <button
            class="toggle-btn ${this._meshVisible ? "active" : ""}"
            @click=${() => this._setMeshVisible(true)}
          >
            Mesh
          </button>
          <button
            class="toggle-btn ${this._alertsVisible ? "active" : ""}"
            @click=${() => this._setAlertsVisible(!this._alertsVisible)}
          >
            Alerts
          </button>
          <a
            class="action-btn"
            href="https://nordstad.github.io/zigporter-hacs/"
            target="_blank"
            rel="noopener"
            title="Documentation"
            >Help</a
          >
          <button
            class="action-btn"
            title="Zoom in"
            ?disabled=${this._buttonsDisabled}
            @click=${() => this._zoomBy(0.7)}
          >
            +
          </button>
          <button
            class="action-btn"
            title="Zoom out"
            ?disabled=${this._buttonsDisabled}
            @click=${() => this._zoomBy(1 / 0.7)}
          >
            −
          </button>
          <button
            class="action-btn"
            title="Reset zoom"
            ?disabled=${this._buttonsDisabled}
            @click=${this._resetView}
          >
            Reset
          </button>
          <button
            class="action-btn"
            title="Refresh network scan"
            ?disabled=${this._buttonsDisabled}
            @click=${() => this._fetchMap(true)}
          >
            Scan
          </button>
        </div>
        ${this._searchOpen && this._searchResults.length > 0
          ? html`<div class="search-dropdown">
              ${this._searchResults.map(
                (name, i) => html`
                  <div
                    class="search-dropdown-item ${i === this._searchActiveIndex ? "active" : ""}"
                    @mousedown=${() => this._selectSearchResult(name)}
                  >
                    ${name}
                  </div>
                `,
              )}
            </div>`
          : nothing}
      </div>
    `;
  }

  _renderLegend() {
    return html`
      <div class="legend">
        <div class="legend-section">
          <span class="legend-item"
            ><span class="legend-dot" style="background:#f59e0b"></span
            ><span>Coordinator</span></span
          >
          <span class="legend-item"
            ><span class="legend-dot" style="background:#0ea5e9"></span
            ><span>Router</span></span
          >
          <span class="legend-item"
            ><span class="legend-dot" style="background:#475569"></span
            ><span>End device</span></span
          >
          <span class="legend-item"
            ><span class="legend-dot warn" style="background:#0ea5e9"></span
            ><span>Weak (&lt;50)</span></span
          >
          <span class="legend-item"
            ><span class="legend-dot crit" style="background:#0ea5e9"></span
            ><span>Critical (&lt;20)</span></span
          >
        </div>
        <div class="legend-section">
          <span class="legend-item"
            ><span class="legend-line" style="background:#22c55e"></span
            ><span>LQI ≥ 50</span></span
          >
          <span class="legend-item"
            ><span class="legend-line" style="background:#f59e0b"></span
            ><span>LQI 20–50</span></span
          >
          <span class="legend-item"
            ><span class="legend-line" style="background:#ef4444"></span
            ><span>LQI &lt; 20</span></span
          >
          <span class="legend-item"
            ><span
              class="legend-line"
              style="background:#64748b; border-top: 2px dashed #64748b; height:0"
            ></span
            ><span>No data (sleepy)</span></span
          >
          <span class="legend-item" style="opacity:0.7"
            >Badge = path-min LQI</span
          >
        </div>
      </div>
    `;
  }

  _renderLoading() {
    return html`
      <div class="status">
        <div class="spinner"></div>
        <div>Scanning network…</div>
        <div class="timer">
          This typically takes 1–4 minutes depending on network size. Timeout
          can be increased in integration options.
        </div>
        <div class="timer">
          Scroll to zoom, drag to pan. On mobile: pinch to zoom. Use Reset to
          restore view.
        </div>
        ${this._elapsed > 0
          ? html`<div class="timer">${this._elapsed}s elapsed</div>`
          : nothing}
      </div>
    `;
  }

  _renderError() {
    return html`
      <div class="status">
        <div class="error">${this._error}</div>
      </div>
    `;
  }

  _renderMap() {
    if (!this._svgContent) return nothing;
    return html`${unsafeHTML(this._svgContent)}`;
  }

  async _fetchMap(forceRefresh) {
    if (!this._hass) return;

    this._buttonsDisabled = true;
    this._error = null;
    this._svgContent = null;

    let timerOffset = 0;
    if (!forceRefresh) {
      try {
        const status = await this._hass.callWS({
          type: "zigporter/scan_status",
        });
        if (status.scanning && status.scan_start_utc) {
          timerOffset = Math.floor(
            (Date.now() - new Date(status.scan_start_utc).getTime()) / 1000,
          );
        }
      } catch (_) {
        /* ignore */
      }
    }

    this._loading = true;
    this._elapsed = timerOffset;
    const startTime = Date.now() - timerOffset * 1000;

    this._timerInterval = setInterval(() => {
      this._elapsed = Math.floor((Date.now() - startTime) / 1000);
    }, 1000);

    try {
      const result = await this._hass.callWS({
        type: "zigporter/network_map",
        force_refresh: forceRefresh,
      });

      clearInterval(this._timerInterval);
      this._timerInterval = null;

      const svgString = this._processSvg(result.svg);
      if (!svgString) {
        this._error = "Failed to parse SVG";
        this._loading = false;
        return;
      }

      this._svgContent = svgString;
      this._loading = false;

      if (this._config.show_stats) {
        const duration =
          result.scan_duration_ms < 1000
            ? result.scan_duration_ms + "ms"
            : (result.scan_duration_ms / 1000).toFixed(1) + "s";
        const backendLabel = result.backend === "zha" ? "ZHA" : "Z2M";
        let stats = `${backendLabel} · ${result.device_count} devices · ${result.max_depth} hops · ${duration}`;
        if (result.scan_timestamp) {
          stats += ` · Scanned ${new Date(result.scan_timestamp).toLocaleString()}`;
        }
        stats += " · estimated";
        this._stats = stats;
      }
    } catch (err) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.warn(
        `Zigporter: scan failed after ${elapsed}s —`,
        err.message || err,
      );
      this._error = err.message || "Failed to load map";
      this._loading = false;
    } finally {
      this._buttonsDisabled = false;
    }
  }

  _processSvg(rawSvg) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawSvg, "image/svg+xml");
    const svgEl = doc.documentElement;

    if (
      svgEl.nodeName === "parsererror" ||
      svgEl.querySelector("parsererror")
    ) {
      return null;
    }

    if (!svgEl.getAttribute("viewBox")) {
      const w = svgEl.getAttribute("width");
      const h = svgEl.getAttribute("height");
      if (w && h) svgEl.setAttribute("viewBox", `0 0 ${w} ${h}`);
    }
    svgEl.removeAttribute("width");
    svgEl.removeAttribute("height");
    svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");

    return new XMLSerializer().serializeToString(svgEl);
  }

  _setMeshVisible(visible) {
    this._meshVisible = visible;
    const svgEl = this.renderRoot.querySelector(".map-container svg");
    if (!svgEl) return;
    const meshGroup = svgEl.querySelector(".mesh-links");
    if (meshGroup) {
      meshGroup.style.display = visible ? "block" : "none";
    }
  }

  _setAlertsVisible(visible) {
    this._alertsVisible = visible;
    const svgEl = this.renderRoot.querySelector(".map-container svg");
    if (!svgEl) return;
    svgEl.classList.toggle("alerts-mode", visible);
  }

  // --- Search ---

  _extractDeviceNames() {
    const svg = this.renderRoot.querySelector(".map-container svg");
    if (!svg) return;
    const circles = svg.querySelectorAll("circle[data-name]");
    this._deviceNames = [...circles].map((c) => c.getAttribute("data-name"));
  }

  _toggleSearch() {
    this._searchOpen = !this._searchOpen;
    this._searchQuery = "";
    this._searchResults = [];
    this._searchActiveIndex = -1;
    if (this._searchOpen) {
      this._extractDeviceNames();
      this.updateComplete.then(() => {
        const input = this.renderRoot.querySelector(".search-input");
        if (input) input.focus();
      });
    } else {
      this._clearHighlight();
    }
  }

  _onSearchInput(e) {
    this._searchQuery = e.target.value;
    this._searchActiveIndex = -1;
    if (!this._searchQuery) {
      this._searchResults = [];
      this._clearHighlight();
      return;
    }
    const q = this._searchQuery.toLowerCase();
    this._searchResults = this._deviceNames
      .filter((name) => name.toLowerCase().includes(q))
      .slice(0, 20);
  }

  _onSearchKeydown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this._searchActiveIndex = Math.min(
        this._searchActiveIndex + 1,
        this._searchResults.length - 1,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this._searchActiveIndex = Math.max(this._searchActiveIndex - 1, -1);
    } else if (e.key === "Enter" && this._searchActiveIndex >= 0) {
      e.preventDefault();
      this._selectSearchResult(this._searchResults[this._searchActiveIndex]);
    } else if (e.key === "Escape") {
      this._toggleSearch();
    }
  }

  _onSearchBlur() {
    setTimeout(() => {
      if (!this._searchQuery) {
        this._searchOpen = false;
        this._searchResults = [];
        this._clearHighlight();
      } else {
        this._searchResults = [];
      }
    }, 200);
  }

  _selectSearchResult(name) {
    this._searchResults = [];
    this._searchQuery = name;
    this._navigateToNode(name);
  }

  _navigateToNode(name) {
    const svg = this.renderRoot.querySelector(".map-container svg");
    if (!svg || !this._vb) return;
    const circle = svg.querySelector(`circle[data-name="${CSS.escape(name)}"]`);
    if (!circle) return;

    const cx = parseFloat(circle.getAttribute("cx"));
    const cy = parseFloat(circle.getAttribute("cy"));

    const minW = this._vbInitial.w / 8;
    const targetW = Math.max(minW, Math.min(600, this._vbInitial.w));
    const aspect = this._vbInitial.h / this._vbInitial.w;
    const targetH = targetW * aspect;

    this._vb.w = targetW;
    this._vb.h = targetH;
    this._vb.x = cx - targetW / 2;
    this._vb.y = cy - targetH / 2;
    this._zoomLevel = this._vbInitial.w / this._vb.w;
    this._applyViewBox();
    this._highlightNode(circle);
  }

  _highlightNode(circle) {
    this._clearHighlight();
    const svg = this.renderRoot.querySelector(".map-container svg");
    if (!svg) return;

    const cx = circle.getAttribute("cx");
    const cy = circle.getAttribute("cy");
    const ns = "http://www.w3.org/2000/svg";
    const ring = document.createElementNS(ns, "circle");
    ring.setAttribute("cx", cx);
    ring.setAttribute("cy", cy);
    ring.setAttribute("r", "35");
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "#ffffff");
    ring.setAttribute("stroke-width", "3");
    ring.classList.add("search-highlight");
    svg.appendChild(ring);

    const animate = document.createElementNS(ns, "animate");
    animate.setAttribute("attributeName", "r");
    animate.setAttribute("from", "35");
    animate.setAttribute("to", "55");
    animate.setAttribute("dur", "1s");
    animate.setAttribute("repeatCount", "2");
    animate.setAttribute("fill", "freeze");
    ring.appendChild(animate);

    const animateOpacity = document.createElementNS(ns, "animate");
    animateOpacity.setAttribute("attributeName", "opacity");
    animateOpacity.setAttribute("from", "1");
    animateOpacity.setAttribute("to", "0");
    animateOpacity.setAttribute("dur", "1s");
    animateOpacity.setAttribute("repeatCount", "2");
    animateOpacity.setAttribute("fill", "freeze");
    ring.appendChild(animateOpacity);

    setTimeout(() => ring.remove(), 2100);
  }

  _clearHighlight() {
    const svg = this.renderRoot.querySelector(".map-container svg");
    if (!svg) return;
    svg.querySelectorAll(".search-highlight").forEach((el) => el.remove());
  }

  // --- Pan/Zoom ---

  _initPanZoom(svgEl) {
    const vbStr = svgEl.getAttribute("viewBox");
    if (!vbStr) return;
    const [x, y, w, h] = vbStr.split(/\s+/).map(Number);
    this._vb = { x, y, w, h };
    this._vbInitial = { x, y, w, h };
    this._zoomLevel = 1;
    this._pointers = new Map();
    this._lastPanPoint = null;
    this._lastPinchDist = null;
    this._lastPinchMid = null;

    svgEl.addEventListener("wheel", this._boundOnWheel, { passive: false });
    svgEl.addEventListener("pointerdown", this._boundOnPointerDown);
    svgEl.addEventListener("pointermove", this._boundOnPointerMove);
    svgEl.addEventListener("pointerup", this._boundOnPointerUp);
    svgEl.addEventListener("pointercancel", this._boundOnPointerUp);
  }

  _teardownPanZoom() {
    if (this._svgEl) {
      this._svgEl.removeEventListener("wheel", this._boundOnWheel);
      this._svgEl.removeEventListener("pointerdown", this._boundOnPointerDown);
      this._svgEl.removeEventListener("pointermove", this._boundOnPointerMove);
      this._svgEl.removeEventListener("pointerup", this._boundOnPointerUp);
      this._svgEl.removeEventListener("pointercancel", this._boundOnPointerUp);
    }
  }

  _screenToSVG(clientX, clientY) {
    const ctm = this._svgEl.getScreenCTM();
    if (ctm) {
      const pt = this._svgEl.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      return pt.matrixTransform(ctm.inverse());
    }
    const rect = this._svgEl.getBoundingClientRect();
    return {
      x: this._vb.x + ((clientX - rect.left) / rect.width) * this._vb.w,
      y: this._vb.y + ((clientY - rect.top) / rect.height) * this._vb.h,
    };
  }

  _applyViewBox() {
    this._svgEl.setAttribute(
      "viewBox",
      `${this._vb.x} ${this._vb.y} ${this._vb.w} ${this._vb.h}`,
    );
  }

  _resetView() {
    if (!this._vbInitial || !this._svgEl) return;
    this._vb = { ...this._vbInitial };
    this._zoomLevel = 1;
    this._applyViewBox();
    this._searchOpen = false;
    this._searchQuery = "";
    this._searchResults = [];
    this._searchActiveIndex = -1;
    this._clearHighlight();
  }

  _zoomBy(factor) {
    if (!this._vb) return;
    const newZoom = this._vbInitial.w / (this._vb.w * factor);
    if (newZoom < 1 || newZoom > 8) return;
    const cx = this._vb.x + this._vb.w / 2;
    const cy = this._vb.y + this._vb.h / 2;
    this._vb.w *= factor;
    this._vb.h *= factor;
    this._vb.x = cx - this._vb.w / 2;
    this._vb.y = cy - this._vb.h / 2;
    this._zoomLevel = this._vbInitial.w / this._vb.w;
    this._applyViewBox();
  }

  _onWheel(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!this._vb) return;

    const isMouseWheel =
      e.deltaMode !== 0 || (Math.abs(e.deltaY) > 50 && Math.abs(e.deltaX) < 5);
    if (e.ctrlKey || isMouseWheel) {
      // Pinch gesture (ctrlKey) or physical mouse wheel → zoom to cursor
      const factor = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.001));
      const newZoom = this._vbInitial.w / (this._vb.w * factor);
      if (newZoom < 1 || newZoom > 8) return;
      const svgPt = this._screenToSVG(e.clientX, e.clientY);
      this._vb.w *= factor;
      this._vb.h *= factor;
      const rect = this._svgEl.getBoundingClientRect();
      this._vb.x =
        svgPt.x - ((e.clientX - rect.left) / rect.width) * this._vb.w;
      this._vb.y =
        svgPt.y - ((e.clientY - rect.top) / rect.height) * this._vb.h;
      this._zoomLevel = this._vbInitial.w / this._vb.w;
    } else {
      // Two-finger scroll (trackpad, small pixel deltas) → pan
      const rect = this._svgEl.getBoundingClientRect();
      this._vb.x += (e.deltaX / rect.width) * this._vb.w;
      this._vb.y += (e.deltaY / rect.height) * this._vb.h;
    }

    this._applyViewBox();
  }

  _onPointerDown(e) {
    this._svgEl.setPointerCapture(e.pointerId);
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this._pointers.size === 1) {
      this._lastPanPoint = { x: e.clientX, y: e.clientY };
    } else if (this._pointers.size === 2) {
      this._lastPanPoint = null;
      this._lastPinchDist = null;
      this._lastPinchMid = null;
    }
  }

  _onPointerMove(e) {
    if (!this._pointers.has(e.pointerId) || !this._vb) return;
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this._pointers.size === 1) {
      this._handlePan(e);
    } else if (this._pointers.size === 2) {
      this._handlePinch();
    }
  }

  _onPointerUp(e) {
    this._pointers.delete(e.pointerId);
    if (this._pointers.size < 2) {
      this._lastPinchDist = null;
      this._lastPinchMid = null;
    }
    if (this._pointers.size === 1) {
      const [pt] = this._pointers.values();
      this._lastPanPoint = { x: pt.x, y: pt.y };
    } else {
      this._lastPanPoint = null;
    }
  }

  _handlePan(e) {
    if (!this._lastPanPoint) return;
    const rect = this._svgEl.getBoundingClientRect();
    const dx = ((this._lastPanPoint.x - e.clientX) / rect.width) * this._vb.w;
    const dy = ((this._lastPanPoint.y - e.clientY) / rect.height) * this._vb.h;
    this._vb.x += dx;
    this._vb.y += dy;
    this._lastPanPoint = { x: e.clientX, y: e.clientY };
    this._applyViewBox();
  }

  _handlePinch() {
    const pts = [...this._pointers.values()];
    if (pts.length !== 2) return;
    const [a, b] = pts;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;

    if (this._lastPinchDist !== null) {
      const scaleDelta = this._lastPinchDist / dist;
      const newZoom = this._vbInitial.w / (this._vb.w * scaleDelta);

      if (newZoom >= 1 && newZoom <= 8) {
        const svgMid = this._screenToSVG(midX, midY);
        this._vb.w *= scaleDelta;
        this._vb.h *= scaleDelta;
        const rect = this._svgEl.getBoundingClientRect();
        const fracX = (midX - rect.left) / rect.width;
        const fracY = (midY - rect.top) / rect.height;
        this._vb.x = svgMid.x - fracX * this._vb.w;
        this._vb.y = svgMid.y - fracY * this._vb.h;
        this._zoomLevel = this._vbInitial.w / this._vb.w;
      }

      const rect = this._svgEl.getBoundingClientRect();
      const svgDx = ((this._lastPinchMid.x - midX) / rect.width) * this._vb.w;
      const svgDy = ((this._lastPinchMid.y - midY) / rect.height) * this._vb.h;
      this._vb.x += svgDx;
      this._vb.y += svgDy;
      this._applyViewBox();
    }

    this._lastPinchDist = dist;
    this._lastPinchMid = { x: midX, y: midY };
  }
}

// --- Registration ---

if (!customElements.get("zigporter-network-map-card")) {
  customElements.define("zigporter-network-map-card", ZigporterNetworkMapCard);
  console.info("Zigporter: card registered");

  const tag = "zigporter-network-map-card";
  let attempts = 0;
  const tryReplace = () => {
    let found = false;
    function walk(root) {
      /* c8 ignore next */
      if (!root) return;
      const nodes = root.querySelectorAll("*");
      for (const node of nodes) {
        if (node.localName === "hui-error-card") {
          const cfg = node._config || node.config;
          if (cfg && cfg.message && cfg.message.includes(tag)) {
            const card = document.createElement(tag);
            card.setConfig({});
            const ha = document.querySelector("home-assistant");
            if (ha && ha.hass) card.hass = ha.hass;
            node.parentElement.replaceChild(card, node);
            found = true;
          }
        }
        if (node.shadowRoot) walk(node.shadowRoot);
      }
    }
    walk(document.body);
    if (!found && ++attempts < 10) window.setTimeout(tryReplace, 500);
  };
  window.setTimeout(tryReplace, 500);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "zigporter-network-map-card")) {
  window.customCards.push({
    type: "zigporter-network-map-card",
    name: "Zigporter Network Map",
    description: "Visualize your Zigbee mesh network topology",
  });
}
