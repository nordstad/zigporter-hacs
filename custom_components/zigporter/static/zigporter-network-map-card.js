class ZigporterNetworkMapCard extends HTMLElement {
  _svgEl = null;
  _vb = null;
  _vbInitial = null;
  _zoomLevel = 1;
  _pointers = new Map();
  _lastPanPoint = null;
  _lastPinchDist = null;
  _lastPinchMid = null;

  static getConfigElement() {
    return document.createElement("zigporter-network-map-card-editor");
  }

  static getStubConfig() {
    return { title: "Zigbee Network Map", show_stats: true };
  }

  setConfig(config) {
    this._config = {
      title: config.title || "Zigbee Network Map",
      show_stats: config.show_stats !== false,
    };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialized) {
      this._initialized = true;
      this._render();
      this._fetchMap(false);
    }
  }

  _render() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }

    const card = document.createElement("ha-card");

    const style = document.createElement("style");
    style.textContent = `
      :host { display: block; }
      ha-card { overflow: hidden; }
      .header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 0; }
      .header h2 { margin: 0; font-size: 16px; font-weight: 500; }
      .stats { padding: 0 16px 4px; font-size: 12px; color: var(--secondary-text-color); }
      .map-container { width: 100%; }
      .map-container svg { width: 100%; height: calc(100vh - 140px); display: block; cursor: grab; touch-action: none; }
      .map-container svg:active { cursor: grabbing; }
      .legend { display: flex; flex-wrap: wrap; gap: 16px 32px; padding: 10px 16px; font-size: 13px; color: var(--secondary-text-color); border-top: 1px solid var(--divider-color, #333); }
      .legend-section { display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: center; }
      .legend-item { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
      .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
      .legend-dot.warn { box-shadow: 0 0 4px #f59e0b; border: 1.5px solid #f59e0b; }
      .legend-dot.crit { box-shadow: 0 0 4px #ef4444; border: 1.5px solid #ef4444; }
      .legend-line { width: 18px; height: 2px; flex-shrink: 0; border-radius: 1px; }
      .status { padding: 48px 24px; text-align: center; color: var(--secondary-text-color); }
      .error { color: var(--error-color); }
      .spinner {
        width: 32px; height: 32px; margin: 0 auto 16px;
        border: 3px solid var(--divider-color, #444);
        border-top-color: var(--primary-color);
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .timer { font-size: 12px; margin-top: 8px; opacity: 0.7; }
      .btn-group { display: flex; align-items: center; gap: 8px; }
      .action-btn {
        background: none; border: 1px solid var(--divider-color, #444);
        border-radius: 4px; cursor: pointer; color: var(--primary-text-color);
        padding: 4px 12px; font-size: 13px; font-weight: 500;
      }
      .action-btn:hover { background: var(--secondary-background-color); }
      .action-btn:disabled { opacity: 0.3; cursor: default; }
    `;

    const header = document.createElement("div");
    header.className = "header";

    const title = document.createElement("h2");
    title.textContent = this._config.title;

    const refreshBtn = document.createElement("button");
    refreshBtn.className = "action-btn";
    refreshBtn.textContent = "Scan";
    refreshBtn.title = "Refresh network scan";
    refreshBtn.addEventListener("click", () => this._fetchMap(true));

    const resetBtn = document.createElement("button");
    resetBtn.className = "action-btn";
    resetBtn.textContent = "Reset";
    resetBtn.title = "Reset zoom";
    resetBtn.addEventListener("click", () => this._resetView());

    const btnGroup = document.createElement("div");
    btnGroup.className = "btn-group";
    btnGroup.appendChild(resetBtn);
    btnGroup.appendChild(refreshBtn);

    header.appendChild(title);
    header.appendChild(btnGroup);

    const stats = document.createElement("div");
    stats.className = "stats";
    stats.id = "stats";

    const mapContainer = document.createElement("div");
    mapContainer.className = "map-container";
    mapContainer.id = "map";

    const loading = document.createElement("div");
    loading.className = "status";
    const spinner = document.createElement("div");
    spinner.className = "spinner";
    const loadMsg = document.createElement("div");
    loadMsg.textContent = "Scanning network\u2026";
    const timer = document.createElement("div");
    timer.className = "timer";
    timer.id = "timer";
    loading.appendChild(spinner);
    loading.appendChild(loadMsg);
    loading.appendChild(timer);
    mapContainer.appendChild(loading);

    const legend = document.createElement("div");
    legend.className = "legend";

    const nodeSection = document.createElement("div");
    nodeSection.className = "legend-section";
    const edgeSection = document.createElement("div");
    edgeSection.className = "legend-section";

    const nodeItems = [
      { color: "#f59e0b", label: "Coordinator", cls: "" },
      { color: "#0ea5e9", label: "Router", cls: "" },
      { color: "#475569", label: "End device", cls: "" },
      { color: "#0ea5e9", label: "Weak (<50)", cls: "warn" },
      { color: "#0ea5e9", label: "Critical (<20)", cls: "crit" },
    ];
    for (const item of nodeItems) {
      const span = document.createElement("span");
      span.className = "legend-item";
      const dot = document.createElement("span");
      dot.className = "legend-dot" + (item.cls ? " " + item.cls : "");
      dot.style.background = item.color;
      const text = document.createElement("span");
      text.textContent = item.label;
      span.appendChild(dot);
      span.appendChild(text);
      nodeSection.appendChild(span);
    }

    const edgeItems = [
      { color: "#22c55e", label: "LQI ≥ 50" },
      { color: "#f59e0b", label: "LQI 20–50" },
      { color: "#ef4444", label: "LQI < 20" },
    ];
    for (const item of edgeItems) {
      const span = document.createElement("span");
      span.className = "legend-item";
      const line = document.createElement("span");
      line.className = "legend-line";
      line.style.background = item.color;
      const text = document.createElement("span");
      text.textContent = item.label;
      span.appendChild(line);
      span.appendChild(text);
      edgeSection.appendChild(span);
    }
    const badgeNote = document.createElement("span");
    badgeNote.className = "legend-item";
    badgeNote.style.opacity = "0.7";
    badgeNote.textContent = "Badge = path-min LQI";
    edgeSection.appendChild(badgeNote);

    legend.appendChild(nodeSection);
    legend.appendChild(edgeSection);

    card.appendChild(header);
    card.appendChild(stats);
    card.appendChild(legend);
    card.appendChild(mapContainer);

    this.shadowRoot.textContent = "";
    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(card);
  }

  async _fetchMap(forceRefresh) {
    if (!this._hass) return;

    const mapEl = this.shadowRoot.getElementById("map");
    const statsEl = this.shadowRoot.getElementById("stats");
    const btns = this.shadowRoot.querySelectorAll(".action-btn");

    btns.forEach((b) => (b.disabled = true));

    // Show loading state with spinner and elapsed timer
    mapEl.textContent = "";
    const statusDiv = document.createElement("div");
    statusDiv.className = "status";
    const spinner = document.createElement("div");
    spinner.className = "spinner";
    const msg = document.createElement("div");
    msg.textContent = "Scanning network\u2026";
    const hint = document.createElement("div");
    hint.className = "timer";
    hint.textContent = "This typically takes 1\u20134 minutes depending on network size. Timeout can be increased in integration options.";
    const zoomHint = document.createElement("div");
    zoomHint.className = "timer";
    zoomHint.textContent = "Scroll to zoom, drag to pan. On mobile: pinch to zoom. Use Reset to restore view.";
    const timerDiv = document.createElement("div");
    timerDiv.className = "timer";
    statusDiv.appendChild(spinner);
    statusDiv.appendChild(msg);
    statusDiv.appendChild(hint);
    statusDiv.appendChild(zoomHint);
    statusDiv.appendChild(timerDiv);
    mapEl.appendChild(statusDiv);

    const startTime = Date.now();
    const timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      timerDiv.textContent = elapsed + "s elapsed";
    }, 1000);

    try {
      const result = await this._hass.callWS({
        type: "zigporter/network_map",
        force_refresh: forceRefresh,
      });

      clearInterval(timerInterval);

      const parser = new DOMParser();
      const doc = parser.parseFromString(result.svg, "image/svg+xml");
      const svgEl = doc.documentElement;

      if (svgEl.nodeName === "parsererror" || svgEl.querySelector("parsererror")) {
        mapEl.textContent = "";
        const errDiv = document.createElement("div");
        errDiv.className = "status";
        const errMsg = document.createElement("div");
        errMsg.className = "error";
        errMsg.textContent = "Failed to parse SVG";
        errDiv.appendChild(errMsg);
        mapEl.appendChild(errDiv);
        return;
      }

      // Synthesize viewBox from pixel dimensions before stripping them so the
      // SVG scales correctly without a fixed size.
      if (!svgEl.getAttribute("viewBox")) {
        const w = svgEl.getAttribute("width");
        const h = svgEl.getAttribute("height");
        if (w && h) svgEl.setAttribute("viewBox", "0 0 " + w + " " + h);
      }
      svgEl.removeAttribute("width");
      svgEl.removeAttribute("height");
      svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");

      mapEl.textContent = "";
      mapEl.appendChild(svgEl);
      this._svgEl = svgEl;
      this._initPanZoom(svgEl);

      if (this._config.show_stats && statsEl) {
        const duration = result.scan_duration_ms < 1000
          ? result.scan_duration_ms + "ms"
          : (result.scan_duration_ms / 1000).toFixed(1) + "s";
        const backendLabel = result.backend === "zha" ? "ZHA" : "Z2M";
        statsEl.textContent = backendLabel + " \u00b7 " + result.device_count + " devices \u00b7 " + result.max_depth + " hops \u00b7 " + duration;
      }
    } catch (err) {
      clearInterval(timerInterval);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      mapEl.textContent = "";
      const errDiv = document.createElement("div");
      errDiv.className = "status";
      const errMsg = document.createElement("div");
      errMsg.className = "error";
      errMsg.textContent = err.message || "Failed to load map";
      const errTimer = document.createElement("div");
      errTimer.className = "timer";
      errTimer.textContent = "after " + elapsed + "s";
      errDiv.appendChild(errMsg);
      errDiv.appendChild(errTimer);
      mapEl.appendChild(errDiv);
    } finally {
      btns.forEach((b) => (b.disabled = false));
    }
  }

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

    svgEl.addEventListener("wheel", (e) => this._onWheel(e), { passive: false });
    svgEl.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    svgEl.addEventListener("pointermove", (e) => this._onPointerMove(e));
    svgEl.addEventListener("pointerup", (e) => this._onPointerUp(e));
    svgEl.addEventListener("pointercancel", (e) => this._onPointerUp(e));
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
    this._svgEl.setAttribute("viewBox", `${this._vb.x} ${this._vb.y} ${this._vb.w} ${this._vb.h}`);
  }

  _resetView() {
    if (!this._vbInitial || !this._svgEl) return;
    this._vb = { ...this._vbInitial };
    this._zoomLevel = 1;
    this._applyViewBox();
  }

  _onWheel(e) {
    e.preventDefault();
    if (!this._vb) return;
    const delta = -Math.sign(e.deltaY);
    const factor = delta > 0 ? 0.8 : 1.25;

    const newZoom = this._vbInitial.w / (this._vb.w * factor);
    if (newZoom < 1 || newZoom > 8) return;

    const svgPt = this._screenToSVG(e.clientX, e.clientY);
    this._vb.w *= factor;
    this._vb.h *= factor;

    const rect = this._svgEl.getBoundingClientRect();
    const fracX = (e.clientX - rect.left) / rect.width;
    const fracY = (e.clientY - rect.top) / rect.height;
    this._vb.x = svgPt.x - fracX * this._vb.w;
    this._vb.y = svgPt.y - fracY * this._vb.h;

    this._zoomLevel = this._vbInitial.w / this._vb.w;
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

  getCardSize() {
    return 6;
  }
}

customElements.define("zigporter-network-map-card", ZigporterNetworkMapCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "zigporter-network-map-card",
  name: "Zigporter Network Map",
  description: "Visualize your Zigbee mesh network topology",
});
