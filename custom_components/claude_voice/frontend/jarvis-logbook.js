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

  _badgeCls(mode) {
    return mode === "power" || mode === "fast" ? "badge b-" + mode : "badge";
  }

  _render() {
    this.innerHTML = `
      <style>
        jarvis-logbook { display:block; }
        .jl {
          --jl-mono: ui-monospace, "SF Mono", SFMono-Regular, "JetBrains Mono", "Roboto Mono", Menlo, Consolas, monospace;
          --jl-accent: var(--primary-color, #2f6df6);
          --jl-power: #7c5cff; --jl-fast: #1f8fff;
          --jl-err: var(--error-color, #e5484d);
          --jl-ok: var(--success-color, #2faf63);
          --jl-border: var(--divider-color, rgba(128,128,128,.22));
          --jl-surface: var(--card-background-color, #fff);
          --jl-bg: var(--primary-background-color, #f5f6f8);
          --jl-text: var(--primary-text-color, #1c1f24);
          --jl-dim: var(--secondary-text-color, #8a929c);
          container-type: inline-size;
          font-family: var(--paper-font-body1_-_font-family, "Segoe UI", system-ui, sans-serif);
          color: var(--jl-text);
          animation: jl-fade .32s ease both;
        }
        @keyframes jl-fade { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }

        .jl .toolbar {
          position: sticky; top: 0; z-index: 3;
          background: color-mix(in srgb, var(--jl-bg) 88%, transparent);
          -webkit-backdrop-filter: saturate(1.4) blur(8px); backdrop-filter: saturate(1.4) blur(8px);
          padding: 16px 18px 12px; border-bottom: 1px solid var(--jl-border);
        }
        .jl .stats { display:flex; gap:10px; flex-wrap:wrap; }
        .jl .stat {
          display:flex; flex-direction:column; min-width:74px; padding:9px 13px;
          border:1px solid var(--jl-border); border-radius:13px; background:var(--jl-surface);
        }
        .jl .stat b { font-family:var(--jl-mono); font-size:19px; font-weight:650; letter-spacing:-.02em; line-height:1.05; }
        .jl .stat small { margin-top:3px; font-size:9px; text-transform:uppercase; letter-spacing:.09em; color:var(--jl-dim); }

        .jl .filters { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:12px; }
        .jl .filters input, .jl .filters select {
          font:inherit; font-size:13px; padding:6px 11px; color:var(--jl-text);
          border:1px solid var(--jl-border); border-radius:9px; background:var(--jl-surface);
        }
        .jl .filters input:focus, .jl .filters select:focus {
          outline:none; border-color:var(--jl-accent);
          box-shadow:0 0 0 3px color-mix(in srgb, var(--jl-accent) 22%, transparent);
        }
        .jl .filters #jl-q { flex:1 1 180px; min-width:150px; }
        .jl .filters button {
          font:inherit; font-family:var(--jl-mono); font-size:15px; line-height:1; cursor:pointer;
          width:32px; height:32px; color:var(--jl-text);
          border:1px solid var(--jl-border); border-radius:9px; background:var(--jl-surface);
          transition:background .12s, border-color .12s;
        }
        .jl .filters button:hover { background:color-mix(in srgb, var(--jl-accent) 12%, var(--jl-surface)); border-color:var(--jl-accent); }
        .jl .filters label { display:inline-flex; align-items:center; gap:6px; font-size:13px; color:var(--jl-dim); cursor:pointer; }
        .jl .live {
          margin-left:auto; font-family:var(--jl-mono); font-size:11px; font-weight:600;
          color:var(--jl-ok); display:inline-flex; align-items:center; gap:6px; letter-spacing:.02em;
        }
        .jl .live:not(:empty)::before {
          content:""; width:7px; height:7px; border-radius:50%; background:currentColor;
          box-shadow:0 0 0 4px color-mix(in srgb, var(--jl-ok) 22%, transparent); animation:jl-pulse 1.5s ease-in-out infinite;
        }
        @keyframes jl-pulse { 0%,100% { opacity:1; } 50% { opacity:.35; } }

        .jl .wrap { display:flex; gap:16px; align-items:flex-start; padding:8px 18px 28px; }
        .jl .list { flex:1; min-width:0; }
        .jl p.empty, .jl p.note { color:var(--jl-dim); font-size:13px; padding:18px 4px; }
        .jl p.note { padding:8px 4px 0; font-size:11.5px; }

        .jl table { width:100%; border-collapse:separate; border-spacing:0; font-size:13px; }
        .jl thead th {
          text-align:left; font-size:9.5px; font-weight:600; text-transform:uppercase; letter-spacing:.09em;
          color:var(--jl-dim); padding:6px 11px 9px; border-bottom:1px solid var(--jl-border); white-space:nowrap;
        }
        .jl tbody td { padding:10px 11px; border-bottom:1px solid color-mix(in srgb, var(--jl-border) 55%, transparent); vertical-align:top; }
        .jl tbody tr { cursor:pointer; transition:background .12s; }
        .jl tbody tr:hover { background:color-mix(in srgb, var(--jl-accent) 7%, transparent); }
        .jl tbody tr.err { background:color-mix(in srgb, var(--jl-err) 8%, transparent); box-shadow:inset 3px 0 0 var(--jl-err); }
        .jl tbody tr.sel { background:color-mix(in srgb, var(--jl-accent) 13%, transparent); box-shadow:inset 3px 0 0 var(--jl-accent); }
        .jl .mono { font-family:var(--jl-mono); font-size:12px; color:var(--jl-dim); white-space:nowrap; }
        .jl .trunc { max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .jl thead th[colspan] {
          font-family:var(--jl-mono); font-size:11px; text-transform:none; letter-spacing:0;
          color:var(--jl-text); padding-top:16px;
        }
        .jl thead th[colspan] small { color:var(--jl-dim); }

        .jl .badge {
          display:inline-flex; font-family:var(--jl-mono); font-size:10.5px; font-weight:600; letter-spacing:.02em;
          padding:2px 9px; border-radius:999px; background:color-mix(in srgb, var(--jl-dim) 20%, transparent); color:var(--jl-dim);
        }
        .jl .badge.b-power { background:color-mix(in srgb, var(--jl-power) 18%, transparent); color:var(--jl-power); }
        .jl .badge.b-fast  { background:color-mix(in srgb, var(--jl-fast) 18%, transparent); color:var(--jl-fast); }
        .jl .dot { display:inline-block; width:9px; height:9px; border-radius:50%; }
        .jl .dot.ok  { background:var(--jl-ok);  box-shadow:0 0 0 3px color-mix(in srgb, var(--jl-ok) 18%, transparent); }
        .jl .dot.err { background:var(--jl-err); box-shadow:0 0 0 3px color-mix(in srgb, var(--jl-err) 18%, transparent); }

        .jl .detail {
          width:340px; flex-shrink:0; align-self:flex-start;
          position:sticky; top:108px; max-height:calc(100vh - 132px); overflow:auto;
          border:1px solid var(--jl-border); border-radius:15px; background:var(--jl-surface);
          padding:16px 18px 20px; box-shadow:0 10px 34px -18px rgba(0,0,0,.4);
          animation:jl-slide .2s ease both;
        }
        @keyframes jl-slide { from { opacity:0; transform:translateX(10px); } to { opacity:1; transform:none; } }
        .jl .detail.hidden { display:none; }
        .jl .detail .d-head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:13px; padding-bottom:12px; margin-bottom:6px; border-bottom:1px solid var(--jl-border); }
        .jl .detail #jl-close {
          margin-left:auto; cursor:pointer; font-size:18px; line-height:1; width:26px; height:26px; border-radius:7px;
          border:1px solid var(--jl-border); background:transparent; color:var(--jl-dim); transition:background .12s, color .12s;
        }
        .jl .detail #jl-close:hover { background:color-mix(in srgb, var(--jl-err) 14%, transparent); color:var(--jl-err); border-color:var(--jl-err); }
        .jl .detail h4 { margin:14px 0 5px; font-size:9.5px; text-transform:uppercase; letter-spacing:.09em; color:var(--jl-dim); }
        .jl .detail .d-body { font-size:13.5px; line-height:1.5; white-space:pre-wrap; word-break:break-word; }
        .jl .detail .meta { font-family:var(--jl-mono); font-size:11.5px; line-height:1.85; color:var(--jl-dim); word-break:break-all; }
        .jl .detail .meta b { color:var(--jl-text); font-weight:600; }

        @container (max-width: 760px) {
          .jl .wrap { flex-direction:column; }
          .jl .trunc { max-width:46vw; }
          .jl .detail {
            position:fixed; inset:auto 0 0 0; width:auto; top:auto; max-height:82vh;
            border-radius:18px 18px 0 0; box-shadow:0 -10px 40px -10px rgba(0,0,0,.5); z-index:20;
            animation:jl-sheet .22s ease both;
          }
          @keyframes jl-sheet { from { transform:translateY(100%); } to { transform:none; } }
        }
      </style>
      <div class="jl">
        <div class="toolbar">
          <div class="stats" id="jl-stats"></div>
          <div class="filters" id="jl-filters"></div>
        </div>
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
      <label><input type="checkbox" id="jl-group"> 🧵 agrupar conversa</label>
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
            <td><span class="mono" style="padding-left:14px">${fmtTime(r.ts)}</span></td>
            <td class="trunc">${this._esc(r.prompt)}</td>
            <td class="trunc">${this._esc(r.response || (r.error ? "erro: " + r.error : ""))}</td>
            <td><span class="mono">${fmtDuration(r.durationMs)}</span></td>
          </tr>`).join("");
        return `<table><thead><tr><th colspan="4">🧵 ${this._esc(resolveUserName(head.sessionKey, um))} ·
          ${fmtTime(head.ts)} · ${t.records.length} turno(s) · <small>${this._esc(t.sessionId)}</small></th></tr></thead>
          <tbody>${inner}</tbody></table>`;
      }).join("") || `<p class="empty">Sem interações neste dia.</p>`;
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
    ].map(([k, v]) => `<div class="stat"><b>${this._esc(v)}</b><small>${k}</small></div>`).join("");

    const rows = recs.map((r, i) => `
      <tr data-i="${i}" class="${r.ok ? "" : "err"} ${this._selected === r ? "sel" : ""}">
        <td><span class="mono">${fmtTime(r.ts)}</span></td>
        <td>${this._esc(resolveUserName(r.sessionKey, um))}</td>
        <td class="trunc">${this._esc(r.prompt)}</td>
        <td class="trunc">${this._esc(r.response || (r.error ? "erro: " + r.error : ""))}</td>
        <td><span class="${this._badgeCls(r.mode)}">${this._esc(r.mode || "—")}</span></td>
        <td><span class="mono">${fmtDuration(r.durationMs)}</span></td>
        <td><span class="dot ${r.ok ? "ok" : "err"}"></span></td>
      </tr>`).join("");
    const note = this._unreadable ? `<p class="note">${this._unreadable} linha(s) ilegíveis ignoradas</p>` : "";
    this.querySelector("#jl-list").innerHTML = recs.length
      ? `<table><thead><tr><th>Hora</th><th>Usuário</th><th>Prompt</th><th>Resposta</th><th>Modo</th><th>⏱</th><th>✓</th></tr></thead><tbody>${rows}</tbody></table>${note}`
      : `<p class="empty">Sem interações neste dia.</p>${note}`;
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
      <div class="d-head">
        <span class="mono">${fmtTime(r.ts)}</span>
        <span>${this._esc(resolveUserName(r.sessionKey, um))}</span>
        <span class="${this._badgeCls(r.mode)}">${this._esc(r.mode || "—")}</span>
        <span class="dot ${r.ok ? "ok" : "err"}"></span>
        <span class="mono">${fmtDuration(r.durationMs)}</span>
        <button id="jl-close" title="fechar">×</button>
      </div>
      <h4>Prompt</h4><div class="d-body">${this._esc(r.prompt)}</div>
      <h4>Resposta</h4><div class="d-body">${this._esc(r.response || "")}</div>
      ${r.error ? `<h4>Erro</h4><div class="d-body" style="color:var(--jl-err)">${this._esc(r.error)}</div>` : ""}
      <h4>Metadados</h4>
      <div class="meta">
        dispositivo: <b>${this._esc(r.speakTarget)}</b><br>
        warmState: <b>${this._esc(r.warmState)}</b><br>
        sessionId: <b>${this._esc(r.sessionId)}</b><br>
        ts: <b>${this._esc(r.ts)}</b>
      </div>`;
    this.querySelector("#jl-close").onclick = () => {
      this._selected = null;
      d.classList.add("hidden");
      this._renderBody();
    };
    this._renderBody();
  }
}
customElements.define("jarvis-logbook", JarvisLogbook);
