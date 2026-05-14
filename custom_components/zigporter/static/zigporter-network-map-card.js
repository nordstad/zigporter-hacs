class ZigporterNetworkMapCard extends HTMLElement {
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
      .map-container svg { width: 100%; height: calc(100vh - 140px); display: block; }
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
      .refresh-btn { background: none; border: none; cursor: pointer; color: var(--primary-color); padding: 8px; font-size: 18px; }
      .refresh-btn:hover { opacity: 0.8; }
      .refresh-btn:disabled { opacity: 0.3; cursor: default; }
    `;

    const header = document.createElement("div");
    header.className = "header";

    const title = document.createElement("h2");
    title.textContent = this._config.title;

    const refreshBtn = document.createElement("button");
    refreshBtn.className = "refresh-btn";
    refreshBtn.textContent = "↻";
    refreshBtn.title = "Refresh network scan";
    refreshBtn.addEventListener("click", () => this._fetchMap(true));

    header.appendChild(title);
    header.appendChild(refreshBtn);

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

    card.appendChild(header);
    card.appendChild(stats);
    card.appendChild(mapContainer);

    this.shadowRoot.textContent = "";
    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(card);
  }

  async _fetchMap(forceRefresh) {
    if (!this._hass) return;

    const mapEl = this.shadowRoot.getElementById("map");
    const statsEl = this.shadowRoot.getElementById("stats");
    const btn = this.shadowRoot.querySelector(".refresh-btn");

    if (btn) btn.disabled = true;

    // Show loading state with spinner and elapsed timer
    mapEl.textContent = "";
    const statusDiv = document.createElement("div");
    statusDiv.className = "status";
    const spinner = document.createElement("div");
    spinner.className = "spinner";
    const msg = document.createElement("div");
    msg.textContent = "Scanning network\u2026";
    const timerDiv = document.createElement("div");
    timerDiv.className = "timer";
    statusDiv.appendChild(spinner);
    statusDiv.appendChild(msg);
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

      if (this._config.show_stats && statsEl) {
        const duration = result.scan_duration_ms < 1000
          ? result.scan_duration_ms + "ms"
          : (result.scan_duration_ms / 1000).toFixed(1) + "s";
        statsEl.textContent = result.device_count + " devices \u00b7 " + result.max_depth + " hops \u00b7 " + duration;
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
      if (btn) btn.disabled = false;
    }
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
