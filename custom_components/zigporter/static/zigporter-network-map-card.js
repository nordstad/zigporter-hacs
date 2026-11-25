import {
  LitElement,
  html,
  css,
  nothing,
} from "https://cdn.jsdelivr.net/npm/lit@3/+esm";
import { unsafeHTML } from "https://cdn.jsdelivr.net/npm/lit@3/directives/unsafe-html.js/+esm";

const TAP_MAX_MOVE_PX = 6;
const TAP_MAX_MS = 500;
const TAP_SLOP_PX = 14;

const NODE_TYPE_LABELS = {
  Coordinator: "Coordinator",
  Router: "Router",
  EndDevice: "End device",
};

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
    _historyOpen: { state: true },
    _historyList: { state: true },
    _historySnapshot: { state: true },
    _selectedNode: { state: true },
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
      position: relative;
    }
    .node-popup {
      position: absolute;
      top: 12px;
      left: 12px;
      z-index: 5;
      width: max-content;
      min-width: 200px;
      max-width: min(320px, calc(100% - 24px));
      box-sizing: border-box;
      padding: 12px 14px;
      background: var(--card-background-color, #1e1e1e);
      border: 1px solid var(--divider-color, #444);
      border-top: 3px solid var(--accent, var(--primary-color));
      border-radius: 8px;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
      font-size: 13px;
      color: var(--primary-text-color);
    }
    .node-popup-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .node-popup-dot {
      flex: none;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--accent, var(--primary-color));
    }
    .node-popup-name {
      flex: 1;
      font-size: 15px;
      font-weight: 700;
      color: var(--primary-text-color);
      overflow-wrap: anywhere;
    }
    .node-popup-close {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--secondary-text-color);
      font-size: 20px;
      line-height: 1;
      padding: 0 2px;
    }
    .node-popup dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 14px;
      margin: 10px 0;
    }
    .node-popup dt {
      color: var(--secondary-text-color);
    }
    .node-popup dd {
      margin: 0;
      font-weight: 500;
      color: var(--primary-text-color);
      overflow-wrap: anywhere;
    }
    .node-popup dd.lqi-good {
      color: #22c55e;
    }
    .node-popup dd.lqi-warn {
      color: #f59e0b;
    }
    .node-popup dd.lqi-crit {
      color: #ef4444;
    }
    .node-popup-open {
      width: 100%;
      margin-top: 4px;
      padding: 8px 12px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    .node-popup-open:hover {
      filter: brightness(1.1);
    }
    .node-popup-note {
      margin-top: 8px;
      font-size: 12px;
      color: var(--secondary-text-color);
    }
    .map-container svg circle[data-name] {
      cursor: pointer;
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
    .btn-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    @media (max-width: 600px) {
      .header {
        flex-wrap: wrap;
      }
      .btn-group {
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
      }
      .map-container svg {
        height: calc(100vh - 200px);
      }
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
    .action-btn.active {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      border-color: var(--primary-color);
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
    .history-dropdown {
      position: absolute;
      top: 100%;
      right: 16px;
      margin-top: 4px;
      background: var(--card-background-color, #1e1e1e);
      border: 1px solid var(--divider-color, #444);
      border-radius: 4px;
      max-height: 280px;
      overflow-y: auto;
      z-index: 10;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      min-width: 260px;
    }
    .history-item {
      padding: 8px 12px;
      cursor: pointer;
      font-size: 13px;
      color: var(--primary-text-color);
      border-bottom: 1px solid var(--divider-color, #333);
    }
    .history-item:last-child {
      border-bottom: none;
    }
    .history-item:hover {
      background: var(--secondary-background-color);
    }
    .history-item-meta {
      font-size: 11px;
      color: var(--secondary-text-color);
    }
    .history-empty {
      padding: 12px;
      font-size: 13px;
      color: var(--secondary-text-color);
    }
    .history-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 16px;
      font-size: 13px;
      background: var(--secondary-background-color);
      border-bottom: 1px solid var(--divider-color, #333);
    }
    .history-banner button {
      background: none;
      border: 1px solid var(--divider-color, #444);
      border-radius: 4px;
      cursor: pointer;
      color: var(--primary-text-color);
      padding: 2px 10px;
      font-size: 12px;
    }
  `;

  static getStubConfig() {
    return { title: "Zigbee Network Map", show_stats: true };
  }

  static getConfigForm() {
    const labels = {
      title: "Title",
      show_stats: "Show stats",
      entry_id: "Zigporter entry",
    };
    const helpers = {
      title: "Defaults to the entry name when an entry is selected.",
      entry_id:
        "Which Zigbee2MQTT bridge or ZHA setup to show. Leave empty for the original entry.",
    };
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "show_stats", default: true, selector: { boolean: {} } },
        {
          name: "entry_id",
          selector: { config_entry: { integration: "zigporter" } },
        },
      ],
      computeLabel: (schema) => labels[schema.name],
      computeHelper: (schema) => helpers[schema.name],
    };
  }

  constructor() {
    super();
    this._loading = false;
    this._error = null;
    this._svgContent = null;
    this._devices = {};
    this._deviceDetails = {};
    this._warnLqi = 50;
    this._critLqi = 20;
    this._selectedNode = null;
    this._tapStart = null;
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
    this._historyOpen = false;
    this._historyList = [];
    this._historySnapshot = null;
    this._entryTitle = null;

    this._boundOnWheel = (e) => this._onWheel(e);
    this._boundOnPointerDown = (e) => this._onPointerDown(e);
    this._boundOnPointerMove = (e) => this._onPointerMove(e);
    this._boundOnPointerUp = (e) => this._onPointerUp(e);
  }

  setConfig(config) {
    this._config = {
      title: (config && config.title) || "Zigbee Network Map",
      show_stats: !config || config.show_stats !== false,
      entry_id: (config && config.entry_id) || null,
      custom_title: !!(config && config.title),
    };
  }

  _callWS(msg) {
    const entryId = this._config.entry_id;
    return this._hass.callWS(entryId ? { ...msg, entry_id: entryId } : msg);
  }

  // Cards without entry_id look exactly as before; the entry name and topic
  // only show for cards that explicitly select an entry.
  _headerTitle() {
    const c = this._config;
    if (c.custom_title || !c.entry_id || !this._entryTitle) return c.title;
    return this._entryTitle;
  }

  _backendLabel(result) {
    const label = result.backend === "zha" ? "ZHA" : "Z2M";
    return this._config.entry_id && result.mqtt_topic
      ? `${label} · ${result.mqtt_topic}`
      : label;
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
    if (changedProps.has("_selectedNode")) this._syncSelectionRing();
  }

  render() {
    if (!this._config) return nothing;

    return html`
      <ha-card>
        ${this._renderHeader()}
        ${this._historySnapshot ? this._renderHistoryBanner() : nothing}
        ${
          this._config.show_stats && this._stats
            ? html`<div class="stats">${this._stats}</div>`
            : nothing
        }
        ${this._renderLegend()}
        <div class="map-container">
          ${
            this._loading
              ? this._renderLoading()
              : this._error
                ? this._renderError()
                : this._renderMap()
          }
          ${this._selectedNode ? this._renderNodePopup() : nothing}
        </div>
      </ha-card>
    `;
  }

  _renderHistoryBanner() {
    return html`
      <div class="history-banner">
        <span
          >Viewing scan from
          ${this._formatHistoryTimestamp(this._historySnapshot.scan_timestamp)}</span
        >
        <button @click=${this._exitHistoryView}>Back to live</button>
      </div>
    `;
  }

  _renderHeader() {
    return html`
      <div class="header">
        ${
          this._searchOpen
            ? html`<input
                class="search-input"
                type="text"
                placeholder="Search devices…"
                .value=${this._searchQuery}
                @input=${this._onSearchInput}
                @keydown=${this._onSearchKeydown}
                @blur=${this._onSearchBlur}
              />`
            : html`<h2>${this._headerTitle()}</h2>`
        }
        <div class="btn-group">
          <div class="btn-row">
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
          </div>
          <div class="btn-row">
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
            <button
              class="action-btn ${this._historyOpen ? "active" : ""}"
              title="View past scans"
              @click=${this._toggleHistory}
            >
              History
            </button>
          </div>
        </div>
        ${
          this._searchOpen && this._searchResults.length > 0
            ? html`<div class="search-dropdown">
                ${this._searchResults.map(
                  (name, i) => html`
                    <div
                      class="search-dropdown-item ${
                        i === this._searchActiveIndex ? "active" : ""
                      }"
                      @mousedown=${() => this._selectSearchResult(name)}
                    >
                      ${name}
                    </div>
                  `,
                )}
              </div>`
            : nothing
        }
        ${
          this._historyOpen
            ? html`<div class="history-dropdown">
                ${
                  this._historyList.length === 0
                    ? html`<div class="history-empty">
                        No saved scans yet. Run a scan to start building
                        history.
                      </div>`
                    : this._historyList.map(
                        (snap) => html`
                          <div
                            class="history-item"
                            @mousedown=${() => this._selectHistorySnapshot(snap.id)}
                          >
                            <div>
                              ${this._formatHistoryTimestamp(snap.scan_timestamp)}
                            </div>
                            <div class="history-item-meta">
                              ${snap.device_count} devices · ${snap.max_depth}
                              hops
                            </div>
                          </div>
                        `,
                      )
                }
              </div>`
            : nothing
        }
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
            ><span>Weak (&lt;${this._warnLqi})</span></span
          >
          <span class="legend-item"
            ><span class="legend-dot crit" style="background:#0ea5e9"></span
            ><span>Critical (&lt;${this._critLqi})</span></span
          >
        </div>
        <div class="legend-section">
          <span class="legend-item"
            ><span class="legend-line" style="background:#22c55e"></span
            ><span>LQI ≥ ${this._warnLqi}</span></span
          >
          <span class="legend-item"
            ><span class="legend-line" style="background:#f59e0b"></span
            ><span>LQI ${this._critLqi}–${this._warnLqi}</span></span
          >
          <span class="legend-item"
            ><span class="legend-line" style="background:#ef4444"></span
            ><span>LQI &lt; ${this._critLqi}</span></span
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
        ${
          this._elapsed > 0
            ? html`<div class="timer">${this._elapsed}s elapsed</div>`
            : nothing
        }
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
    this._devices = {};
    this._deviceDetails = {};
    this._selectedNode = null;
    this._historySnapshot = null;

    let timerOffset = 0;
    if (!forceRefresh) {
      try {
        const status = await this._callWS({
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
      const result = await this._callWS({
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
      this._devices = result.devices || {};
      this._deviceDetails = result.device_details || {};
      this._warnLqi = result.warn_lqi || 50;
      this._critLqi = result.critical_lqi || 20;
      this._entryTitle = result.entry_title || null;
      this._loading = false;

      if (this._config.show_stats) {
        const duration =
          result.scan_duration_ms < 1000
            ? result.scan_duration_ms + "ms"
            : (result.scan_duration_ms / 1000).toFixed(1) + "s";
        const backendLabel = this._backendLabel(result);
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
      this._error =
        err.code === "unauthorized"
          ? "Administrator access required to view the network map"
          : err.message || "Failed to load map";
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

  // --- History ---

  async _toggleHistory() {
    this._historyOpen = !this._historyOpen;
    if (!this._historyOpen || !this._hass) return;

    try {
      const { snapshots } = await this._callWS({
        type: "zigporter/history_list",
      });
      this._historyList = snapshots || [];
    } catch (_) {
      this._historyList = [];
    }
  }

  async _selectHistorySnapshot(snapshotId) {
    if (!this._hass) return;
    this._historyOpen = false;
    this._buttonsDisabled = true;
    this._error = null;

    try {
      const result = await this._callWS({
        type: "zigporter/history_get",
        snapshot_id: snapshotId,
      });

      const svgString = this._processSvg(result.svg);
      if (!svgString) {
        this._error = "Failed to parse SVG";
        return;
      }

      this._svgContent = svgString;
      this._devices = result.devices || {};
      this._deviceDetails = result.device_details || {};
      this._warnLqi = result.warn_lqi || 50;
      this._critLqi = result.critical_lqi || 20;
      this._selectedNode = null;
      this._historySnapshot = result;
      this._loading = false;

      if (this._config.show_stats) {
        const backendLabel = this._backendLabel(result);
        this._stats = `${backendLabel} · ${result.device_count} devices · ${result.max_depth} hops`;
      }
    } catch (err) {
      this._error = err.message || "Failed to load snapshot";
    } finally {
      this._buttonsDisabled = false;
    }
  }

  _exitHistoryView() {
    this._historySnapshot = null;
    this._fetchMap(false);
  }

  _formatHistoryTimestamp(iso) {
    if (!iso) return "unknown time";
    return new Date(iso).toLocaleString();
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

  _unitsPerPx() {
    const ctm = this._svgEl.getScreenCTM();
    if (ctm && ctm.a) return 1 / ctm.a;
    return this._vb.w / this._svgEl.getBoundingClientRect().width;
  }

  _applyViewBox() {
    this._svgEl.setAttribute(
      "viewBox",
      `${this._vb.x} ${this._vb.y} ${this._vb.w} ${this._vb.h}`,
    );
    if (this._selectedNode) this._syncSelectionRing();
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
    this._selectedNode = null;
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

    // Always zoom (mouse wheel, trackpad scroll and ctrl+pinch alike), so the
    // same gesture never pans in one moment and zooms in the next.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const delta = Math.max(-100, Math.min(100, e.deltaY * unit));
    this._zoomAt(
      e.clientX,
      e.clientY,
      Math.exp(delta * (e.ctrlKey ? 0.01 : 0.0015)),
    );
  }

  // Scale the view by `factor` while keeping the point under the cursor fixed.
  // Uses the real screen mapping, since the map is letterboxed in the card.
  _zoomAt(clientX, clientY, factor) {
    const newZoom = this._vbInitial.w / (this._vb.w * factor);
    if (newZoom < 1 || newZoom > 8) return;
    const anchor = this._screenToSVG(clientX, clientY);
    const cx = this._vb.x + this._vb.w / 2;
    const cy = this._vb.y + this._vb.h / 2;
    this._vb.w *= factor;
    this._vb.h *= factor;
    this._vb.x = cx - this._vb.w / 2;
    this._vb.y = cy - this._vb.h / 2;
    this._applyViewBox();
    const after = this._screenToSVG(clientX, clientY);
    this._vb.x += anchor.x - after.x;
    this._vb.y += anchor.y - after.y;
    this._zoomLevel = this._vbInitial.w / this._vb.w;
    this._applyViewBox();
  }

  _onPointerDown(e) {
    this._svgEl.setPointerCapture(e.pointerId);
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this._pointers.size === 1) {
      this._lastPanPoint = { x: e.clientX, y: e.clientY };
      this._tapStart = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        t: Date.now(),
      };
    } else if (this._pointers.size === 2) {
      this._tapStart = null;
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
    const tap = this._tapStart;
    if (tap && tap.id === e.pointerId) this._tapStart = null;
    const isTap =
      e.type === "pointerup" &&
      tap &&
      tap.id === e.pointerId &&
      Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < TAP_MAX_MOVE_PX &&
      Date.now() - tap.t < TAP_MAX_MS;
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
    if (isTap) this._onTap(e.clientX, e.clientY);
  }

  _nodeAt(clientX, clientY) {
    const pt = this._screenToSVG(clientX, clientY);
    const slop = this._unitsPerPx() * TAP_SLOP_PX;
    let best = null;
    let bestDist = Infinity;
    for (const c of this._svgEl.querySelectorAll("circle[data-name]")) {
      const dist = Math.hypot(
        parseFloat(c.getAttribute("cx")) - pt.x,
        parseFloat(c.getAttribute("cy")) - pt.y,
      );
      if (dist <= parseFloat(c.getAttribute("r")) + slop && dist < bestDist) {
        best = c;
        bestDist = dist;
      }
    }
    return best;
  }

  _onTap(clientX, clientY) {
    const circle = this._nodeAt(clientX, clientY);
    if (!circle) {
      this._selectedNode = null;
      return;
    }
    const ieee = circle.getAttribute("data-ieee");
    const fill = circle.getAttribute("fill") || "";
    const details =
      ieee && Object.hasOwn(this._deviceDetails, ieee)
        ? this._deviceDetails[ieee]
        : null;
    this._selectedNode = {
      cx: circle.getAttribute("cx"),
      cy: circle.getAttribute("cy"),
      r: circle.getAttribute("r"),
      color: /^#[0-9a-f]{3,8}$/i.test(fill) ? fill : null,
      name: circle.getAttribute("data-name"),
      type: circle.getAttribute("data-type"),
      lqi: circle.getAttribute("data-lqi"),
      depth: circle.getAttribute("data-depth"),
      parent: circle.getAttribute("data-parent"),
      lastSeen: circle.getAttribute("data-last-seen"),
      manufacturer: this._detailText(details, "manufacturer"),
      model: this._detailText(details, "model"),
      hasIeee: !!ieee,
      deviceId: ieee ? this._validDeviceId(this._devices[ieee]) : null,
    };
  }

  _syncSelectionRing() {
    const svg = this._svgEl;
    if (!svg) return;
    svg.querySelectorAll(".selected-ring").forEach((el) => el.remove());
    const n = this._selectedNode;
    if (!n || n.cx == null) return;
    const ring = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    ring.setAttribute("cx", n.cx);
    ring.setAttribute("cy", n.cy);
    const upp = this._unitsPerPx();
    ring.setAttribute("r", parseFloat(n.r) + 5 * upp);
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "#ffffff");
    ring.setAttribute("stroke-width", 3 * upp);
    ring.setAttribute("pointer-events", "none");
    ring.classList.add("selected-ring");
    svg.appendChild(ring);
  }

  _validDeviceId(id) {
    return typeof id === "string" && /^[0-9a-f]{32}$/.test(id) ? id : null;
  }

  _renderNodePopup() {
    const n = this._selectedNode;
    const isCoord = n.type === "Coordinator";
    const accent = n.color || "var(--primary-color)";
    return html`
      <div
        class="node-popup"
        role="dialog"
        aria-label="Device details"
        style=${`--accent: ${accent}`}
      >
        <div class="node-popup-header">
          <span class="node-popup-dot"></span>
          <strong class="node-popup-name">${n.name}</strong>
          <button
            class="node-popup-close"
            title="Close"
            @click=${() => (this._selectedNode = null)}
          >
            ×
          </button>
        </div>
        ${
          n.hasIeee
            ? html`<dl>
                <dt>Type</dt>
                <dd>${NODE_TYPE_LABELS[n.type] || "Unknown"}</dd>
                ${
                  n.manufacturer
                    ? html`<dt>Manufacturer</dt>
                        <dd>${n.manufacturer}</dd>`
                    : nothing
                }
                ${
                  n.model
                    ? html`<dt>Model</dt>
                        <dd>${n.model}</dd>`
                    : nothing
                }
                ${
                  isCoord
                    ? nothing
                    : html`
                        <dt>LQI to parent</dt>
                        <dd class=${this._lqiClass(n.lqi)}>
                          ${n.lqi && n.lqi !== "0" ? n.lqi : "Unknown"}
                        </dd>
                        <dt>Hops</dt>
                        <dd>${n.depth || "Unknown"}</dd>
                        <dt>Parent</dt>
                        <dd>${n.parent || "Unknown"}</dd>
                        ${
                          this._formatLastSeen(n.lastSeen)
                            ? html`<dt>Last seen</dt>
                                <dd>${this._formatLastSeen(n.lastSeen)}</dd>`
                            : nothing
                        }
                      `
                }
              </dl>`
            : nothing
        }
        ${
          n.deviceId
            ? html`<button
                class="node-popup-open"
                @click=${() => this._openDevice(n.deviceId)}
              >
                Open device
              </button>`
            : html`<div class="node-popup-note">
                ${
                  n.hasIeee
                    ? "No matching Home Assistant device"
                    : "Run a new scan to link this device"
                }
              </div>`
        }
      </div>
    `;
  }

  _detailText(details, field) {
    if (!details || typeof details !== "object") return null;
    const value = details[field];
    return typeof value === "string" && value ? value : null;
  }

  _lqiClass(lqi) {
    const value = Number(lqi);
    if (!lqi || !value) return "";
    if (value >= this._warnLqi) return "lqi-good";
    return value >= this._critLqi ? "lqi-warn" : "lqi-crit";
  }

  _formatLastSeen(value) {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toLocaleString();
  }

  _openDevice(deviceId) {
    this._navigate(`/config/devices/device/${encodeURIComponent(deviceId)}`);
  }

  _navigate(path) {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed"));
  }

  _handlePan(e) {
    if (!this._lastPanPoint) return;
    const upp = this._unitsPerPx();
    const dx = (this._lastPanPoint.x - e.clientX) * upp;
    const dy = (this._lastPanPoint.y - e.clientY) * upp;
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
      this._zoomAt(midX, midY, scaleDelta);

      const upp = this._unitsPerPx();
      this._vb.x += (this._lastPinchMid.x - midX) * upp;
      this._vb.y += (this._lastPinchMid.y - midY) * upp;
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
