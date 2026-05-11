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
      auto_refresh_interval: config.auto_refresh_interval || 0,
    };
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
    if (this._config.auto_refresh_interval > 0) {
      this._refreshTimer = setInterval(
        () => this._fetchMap(false),
        this._config.auto_refresh_interval * 1000
      );
    }
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
      ha-card { overflow: visible; }
      .header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 0; }
      .header h2 { margin: 0; font-size: 16px; font-weight: 500; }
      .stats { padding: 0 16px; font-size: 12px; color: var(--secondary-text-color); }
      .map-container { padding: 0; overflow-x: auto; overflow-y: visible; }
      .map-container svg { width: 100%; height: auto; display: block; min-height: 600px; }
      .loading { padding: 24px; text-align: center; color: var(--secondary-text-color); }
      .error { padding: 16px; color: var(--error-color); }
      button { background: none; border: none; cursor: pointer; color: var(--primary-color); padding: 8px; font-size: 18px; }
      button:hover { opacity: 0.8; }
    `;

    const header = document.createElement("div");
    header.className = "header";

    const title = document.createElement("h2");
    title.textContent = this._config.title;

    const refreshBtn = document.createElement("button");
    refreshBtn.textContent = "↻";
    refreshBtn.title = "Refresh";
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
    loading.className = "loading";
    loading.textContent = "Loading network map...";
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

    try {
      const result = await this._hass.callWS({
        type: "zigporter/network_map",
        force_refresh: forceRefresh,
      });

      const parser = new DOMParser();
      const doc = parser.parseFromString(result.svg, "image/svg+xml");
      const svgEl = doc.documentElement;

      if (svgEl.nodeName === "parsererror" || svgEl.querySelector("parsererror")) {
        mapEl.textContent = "";
        const errDiv = document.createElement("div");
        errDiv.className = "error";
        errDiv.textContent = "Failed to parse SVG";
        mapEl.appendChild(errDiv);
        return;
      }

      svgEl.removeAttribute("width");
      svgEl.removeAttribute("height");
      svgEl.style.width = "100%";
      svgEl.style.height = "auto";

      mapEl.textContent = "";
      mapEl.appendChild(svgEl);

      if (this._config.show_stats && statsEl) {
        const duration = result.scan_duration_ms < 1000
          ? `${result.scan_duration_ms}ms`
          : `${(result.scan_duration_ms / 1000).toFixed(1)}s`;
        statsEl.textContent = `${result.device_count} devices · ${result.max_depth} hops · ${duration}`;
      }
    } catch (err) {
      mapEl.textContent = "";
      const errDiv = document.createElement("div");
      errDiv.className = "error";
      errDiv.textContent = err.message || "Failed to load map";
      mapEl.appendChild(errDiv);
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
