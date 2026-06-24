class JarvisLogbook extends HTMLElement {
  set hass(h) {
    this._h = h;
    if (this._done) return;
    this._done = true;
    this.innerHTML =
      '<div style="padding:16px;font-family:sans-serif">Jarvis Logbook — painel carregado ✓</div>';
  }
  get hass() { return this._h; }
}
customElements.define("jarvis-logbook", JarvisLogbook);
