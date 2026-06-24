import {
  resolveUserName, fmtDuration, fmtTime, applyFilters, computeStats, groupByThread,
} from "./format.js";

class JarvisLogbook extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._inited = false;
    this._records = [];
    this._unreadable = 0;
    this._date = new Date().toISOString().slice(0, 10);
    this._filters = {};
    this._grouped = false;
    this._selected = null;
    this._visibleCache = [];
  }

  set hass(hass) {
    this._hass = hass;
    if (this._inited) return;
    this._inited = true;
    this._render();
    this._load();
  }
  get hass() { return this._hass; }

  _um() {
    return (this.panel && this.panel.config && this.panel.config.user_names) || {};
  }

  async _load() {
    try {
      const res = await this._hass.connection.sendMessagePromise({
        type: "claude_voice/list_conversations",
        date: this._date,
      });
      this._records = (res.records || []).sort((a, b) => (b.ts > a.ts ? 1 : b.ts < a.ts ? -1 : 0));
      this._unreadable = res.unreadable || 0;
    } catch (e) {
      this._records = [];
      this._unreadable = 0;
    }
    this._selected = null;
    this.querySelector("#jl-detail").classList.add("hidden");
    this._renderBody();
  }

  _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  _render() {
    this.innerHTML = `
      <style>
        .jl { padding:12px; font-family:var(--paper-font-body1_-_font-family,sans-serif); color:var(--primary-text-color); }
        .jl .stats { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
        .jl .stat { background:var(--card-background-color,#fff); border:1px solid var(--divider-color,#ddd); border-radius:8px; padding:6px 10px; font-size:13px; }
        .jl .filters { display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:10px; }
        .jl .filters input,.jl .filters select,.jl .filters button { padding:4px 6px; }
        .jl .wrap { display:flex; gap:12px; align-items:flex-start; }
        .jl .list { flex:1; min-width:0; overflow:auto; }
        .jl table { width:100%; border-collapse:collapse; }
        .jl th,.jl td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--divider-color,#eee); font-size:13px; }
        .jl tbody tr { cursor:pointer; }
        .jl tr.err { background:rgba(229,72,77,.12); }
        .jl tr.sel { box-shadow:inset 3px 0 0 var(--primary-color,#1f6feb); background:rgba(31,111,235,.10); }
        .jl .trunc { max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .jl .badge { font-size:11px; padding:1px 6px; border-radius:10px; background:var(--secondary-background-color,#eee); }
        .jl .detail { width:300px; border-left:1px solid var(--divider-color,#ddd); padding-left:12px; }
        .jl .detail.hidden { display:none; }
        .jl .detail h4 { margin:10px 0 2px; font-size:12px; text-transform:uppercase; color:var(--secondary-text-color,#888); }
        .jl .live { color:#2b9e57; font-weight:600; }
      </style>
      <div class="jl">
        <div class="stats" id="jl-stats"></div>
        <div class="filters" id="jl-filters"></div>
        <div class="wrap">
          <div class="list" id="jl-list"></div>
          <div class="detail hidden" id="jl-detail"></div>
        </div>
      </div>`;
    this._buildFilters();
    this._renderBody();
  }

  _buildFilters() {
    const f = this.querySelector("#jl-filters");
    f.innerHTML = `
      <button id="jl-prev" title="dia anterior">‹</button>
      <input type="date" id="jl-date" value="${this._date}">
      <button id="jl-next" title="próximo dia">›</button>
      <select id="jl-mode"><option value="">modo: todos</option><option value="power">power</option><option value="fast">fast</option></select>
      <select id="jl-status"><option value="">status: todos</option><option value="ok">ok</option><option value="error">erro</option></select>
      <input type="text" id="jl-q" placeholder="buscar prompt/resposta…">
      <label style="font-size:13px"><input type="checkbox" id="jl-group"> 🧵 agrupar conversa</label>
      <span class="live" id="jl-live"></span>`;
    const setDate = (v) => { this._date = v; this.querySelector("#jl-date").value = v; this._load(); };
    this.querySelector("#jl-prev").onclick = () => setDate(this._shift(-1));
    this.querySelector("#jl-next").onclick = () => setDate(this._shift(1));
    this.querySelector("#jl-date").onchange = (e) => setDate(e.target.value);
    this.querySelector("#jl-mode").onchange = (e) => { this._filters.mode = e.target.value || undefined; this._renderBody(); };
    this.querySelector("#jl-status").onchange = (e) => { this._filters.status = e.target.value || undefined; this._renderBody(); };
    this.querySelector("#jl-q").oninput = (e) => { this._filters.query = e.target.value || undefined; this._renderBody(); };
    this.querySelector("#jl-group").onchange = (e) => { this._grouped = e.target.checked; this._renderBody(); };
  }

  _shift(n) {
    const d = new Date(this._date + "T12:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  _renderBody() {
    if (!this.querySelector("#jl-list")) return;
    const um = this._um();
    const recs = applyFilters(this._records, this._filters);
    this._visibleCache = recs;
    if (this._grouped) {
      const threads = groupByThread(recs);
      this.querySelector("#jl-list").innerHTML = threads.map((t) => {
        const head = t.records[0] || {};
        const inner = t.records.map((r, i) => `
          <tr data-tk="${this._esc(t.sessionId)}" data-i="${i}" class="${r.ok ? "" : "err"}">
            <td style="padding-left:18px">${fmtTime(r.ts)}</td>
            <td class="trunc">${this._esc(r.prompt)}</td>
            <td class="trunc">${this._esc(r.response || (r.error ? "erro: " + r.error : ""))}</td>
            <td>${fmtDuration(r.durationMs)}</td>
          </tr>`).join("");
        return `<table><thead><tr><th colspan="4">🧵 ${this._esc(resolveUserName(head.sessionKey, um))} ·
          ${fmtTime(head.ts)} · ${t.records.length} turno(s) · <small>${this._esc(t.sessionId)}</small></th></tr></thead>
          <tbody>${inner}</tbody></table>`;
      }).join("") || "<p>Sem interações neste dia.</p>";
      this.querySelectorAll("#jl-list tbody tr").forEach((tr) => {
        const t = groupByThread(this._visibleCache).find((x) => x.sessionId === tr.dataset.tk);
        if (t) tr.onclick = () => this._select(t.records[Number(tr.dataset.i)]);
      });
      return;
    }
    const s = computeStats(recs);
    this.querySelector("#jl-stats").innerHTML = [
      ["interações", s.total], ["erros", s.errors], ["média", fmtDuration(s.avgMs)],
      ["máx", fmtDuration(s.maxMs)], ["power/fast", s.power + "/" + s.fast],
      ["top", s.topUser ? resolveUserName(s.topUser, um) : "—"],
    ].map(([k, v]) => `<div class="stat"><b>${this._esc(v)}</b> <small>${k}</small></div>`).join("");

    const rows = recs.map((r, i) => `
      <tr data-i="${i}" class="${r.ok ? "" : "err"} ${this._selected === r ? "sel" : ""}">
        <td>${fmtTime(r.ts)}</td>
        <td>${this._esc(resolveUserName(r.sessionKey, um))}</td>
        <td class="trunc">${this._esc(r.prompt)}</td>
        <td class="trunc">${this._esc(r.response || (r.error ? "erro: " + r.error : ""))}</td>
        <td><span class="badge">${this._esc(r.mode || "—")}</span></td>
        <td>${fmtDuration(r.durationMs)}</td>
        <td>${r.ok ? "🟢" : "🔴"}</td>
      </tr>`).join("");
    const note = this._unreadable ? `<p><small>${this._unreadable} linha(s) ilegíveis ignoradas</small></p>` : "";
    this.querySelector("#jl-list").innerHTML = recs.length
      ? `<table><thead><tr><th>Hora</th><th>Usuário</th><th>Prompt</th><th>Resposta</th><th>Modo</th><th>⏱</th><th>✓</th></tr></thead><tbody>${rows}</tbody></table>${note}`
      : `<p>Sem interações neste dia.</p>${note}`;
    this.querySelectorAll("#jl-list tbody tr").forEach((tr) => {
      tr.onclick = () => this._select(this._visibleCache[Number(tr.dataset.i)]);
    });
  }

  _select(r) {
    if (!r) return;
    this._selected = r;
    const um = this._um();
    const d = this.querySelector("#jl-detail");
    d.classList.remove("hidden");
    d.innerHTML = `
      <button id="jl-close" style="float:right">×</button>
      <div><b>${fmtTime(r.ts)}</b> · ${this._esc(resolveUserName(r.sessionKey, um))} ·
        <span class="badge">${this._esc(r.mode || "—")}</span> · ${r.ok ? "ok" : "erro"} · ${fmtDuration(r.durationMs)}</div>
      <h4>Prompt</h4><div>${this._esc(r.prompt)}</div>
      <h4>Resposta</h4><div>${this._esc(r.response || "")}</div>
      ${r.error ? `<h4>Erro</h4><div style="color:#e5484d">${this._esc(r.error)}</div>` : ""}
      <h4>Metadados</h4>
      <div><small>
        dispositivo: ${this._esc(r.speakTarget)}<br>
        warmState: ${this._esc(r.warmState)}<br>
        sessionId: ${this._esc(r.sessionId)}<br>
        ts: ${this._esc(r.ts)}
      </small></div>`;
    this.querySelector("#jl-close").onclick = () => {
      this._selected = null;
      d.classList.add("hidden");
      this._renderBody();
    };
    this._renderBody();
  }
}
customElements.define("jarvis-logbook", JarvisLogbook);
