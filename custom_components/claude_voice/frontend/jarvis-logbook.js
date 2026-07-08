import {
  resolveUserName, fmtDuration, fmtTime, fmtDate, localISODate,
  applyFilters, computeStats, groupByThread, presetRange, monthMatrix,
} from "./format.js";

function shortToolName(name) {
  return name.replace(/^mcp__[^_]+__/, '');
}

class JarvisLogbook extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._inited = false;
    this._records = [];
    this._unreadable = 0;
    this._from = localISODate(Date.now());
    this._to = this._from;
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
    this._hass.connection
      .subscribeEvents((ev) => this._onLive(ev.data), "claude_voice_conversation")
      .then((unsub) => { this._unsub = unsub; })
      .catch(() => {
        // Sem realtime: degrada para um botão "atualizar" manual (spec §7).
        const live = this.querySelector("#jl-live");
        if (!live) return;
        live.innerHTML = '<button id="jl-refresh" title="realtime indisponível">↻ atualizar</button>';
        const b = this.querySelector("#jl-refresh");
        if (b) b.onclick = () => this._load();
      });
  }
  get hass() { return this._hass; }

  _um() {
    return (this.panel && this.panel.config && this.panel.config.user_names) || {};
  }

  async _load() {
    try {
      const lo = this._from <= this._to ? this._from : this._to;
      const hi = this._from <= this._to ? this._to : this._from;
      const res = await this._hass.connection.sendMessagePromise({
        type: "claude_voice/list_conversations",
        from: lo,
        to: hi,
      });
      // O WS devolve um superset (±1 dia UTC nas bordas). Filtra pela data LOCAL
      // de cada registro, tornando a data local autoritativa para o range exibido.
      this._records = (res.records || [])
        .filter((r) => {
          const ld = localISODate(r.ts);
          return ld && ld >= lo && ld <= hi;
        })
        .sort((a, b) => (b.ts > a.ts ? 1 : b.ts < a.ts ? -1 : 0));
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
        :root.jl-sheet-open, html.jl-sheet-open body { overflow:hidden !important; }
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
          /* escala tipográfica: base derivada dos tamanhos antigos × ~1.4, em rem */
          --jl-fs-xs: 0.8rem;   /* ~13px  (antes 9–9.5px labels/th/h4/trace-n) */
          --jl-fs-sm: 0.94rem;  /* ~15px  (antes 10.5–12px badge/mono/trace/live) */
          --jl-fs: 1.13rem;     /* ~18px  (antes 13–13.5px corpo/tabela/filtros) */
          --jl-fs-lg: 1.35rem;  /* ~22px  (antes 15–18px botões/close) */
          --jl-fs-xl: 1.63rem;  /* ~26px  (antes 19px número das stats) */
          container-type: inline-size;
          font-family: var(--paper-font-body1_-_font-family, "Segoe UI", system-ui, sans-serif);
          color: var(--jl-text);
          font-size: var(--jl-fs);
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
        .jl .stat b { font-family:var(--jl-mono); font-size:var(--jl-fs-xl); font-weight:650; letter-spacing:-.02em; line-height:1.05; }
        .jl .stat small { margin-top:3px; font-size:var(--jl-fs-xs); text-transform:uppercase; letter-spacing:.09em; color:var(--jl-dim); }

        .jl .filters { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:12px; }
        .jl .filters input, .jl .filters select {
          font:inherit; font-size:var(--jl-fs); padding:6px 11px; color:var(--jl-text);
          border:1px solid var(--jl-border); border-radius:9px; background:var(--jl-surface);
        }
        .jl .filters input:focus, .jl .filters select:focus {
          outline:none; border-color:var(--jl-accent);
          box-shadow:0 0 0 3px color-mix(in srgb, var(--jl-accent) 22%, transparent);
        }
        .jl .filters #jl-q { flex:1 1 180px; min-width:150px; }
        .jl .filters button {
          font:inherit; font-family:var(--jl-mono); font-size:var(--jl-fs-lg); line-height:1; cursor:pointer;
          width:32px; height:32px; color:var(--jl-text);
          border:1px solid var(--jl-border); border-radius:9px; background:var(--jl-surface);
          transition:background .12s, border-color .12s;
        }
        .jl .filters button:hover { background:color-mix(in srgb, var(--jl-accent) 12%, var(--jl-surface)); border-color:var(--jl-accent); }
        .jl .filters label { display:inline-flex; align-items:center; gap:6px; font-size:var(--jl-fs); color:var(--jl-dim); cursor:pointer; }
        .jl .live {
          margin-left:auto; font-family:var(--jl-mono); font-size:var(--jl-fs-sm); font-weight:600;
          color:var(--jl-ok); display:inline-flex; align-items:center; gap:6px; letter-spacing:.02em;
        }
        .jl .live:not(:empty)::before {
          content:""; width:7px; height:7px; border-radius:50%; background:currentColor;
          box-shadow:0 0 0 4px color-mix(in srgb, var(--jl-ok) 22%, transparent); animation:jl-pulse 1.5s ease-in-out infinite;
        }
        @keyframes jl-pulse { 0%,100% { opacity:1; } 50% { opacity:.35; } }

        .jl .wrap { display:flex; gap:16px; align-items:flex-start; padding:8px 18px 28px; }
        .jl .list { flex:1; min-width:0; }
        .jl p.empty, .jl p.note { color:var(--jl-dim); font-size:var(--jl-fs); padding:18px 4px; }
        .jl p.note { padding:8px 4px 0; font-size:var(--jl-fs-sm); }

        .jl table { width:100%; border-collapse:separate; border-spacing:0; font-size:var(--jl-fs); }
        .jl thead th {
          text-align:left; font-size:var(--jl-fs-xs); font-weight:600; text-transform:uppercase; letter-spacing:.09em;
          color:var(--jl-dim); padding:6px 11px 9px; border-bottom:1px solid var(--jl-border); white-space:nowrap;
        }
        .jl tbody td { padding:10px 11px; border-bottom:1px solid color-mix(in srgb, var(--jl-border) 55%, transparent); vertical-align:top; }
        .jl tbody tr { cursor:pointer; transition:background .12s; }
        .jl tbody tr:hover { background:color-mix(in srgb, var(--jl-accent) 7%, transparent); }
        .jl tbody tr.err { background:color-mix(in srgb, var(--jl-err) 8%, transparent); box-shadow:inset 3px 0 0 var(--jl-err); }
        .jl tbody tr.sel { background:color-mix(in srgb, var(--jl-accent) 13%, transparent); box-shadow:inset 3px 0 0 var(--jl-accent); }
        .jl .mono { font-family:var(--jl-mono); font-size:var(--jl-fs-sm); color:var(--jl-dim); white-space:nowrap; }
        .jl .trunc { max-width:22vw; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .jl thead th[colspan] {
          font-family:var(--jl-mono); font-size:var(--jl-fs-sm); text-transform:none; letter-spacing:0;
          color:var(--jl-text); padding-top:16px;
        }
        .jl thead th[colspan] small { color:var(--jl-dim); }

        .jl .badge {
          display:inline-flex; font-family:var(--jl-mono); font-size:var(--jl-fs-sm); font-weight:600; letter-spacing:.02em;
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
        .jl .detail .d-head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:var(--jl-fs); padding-bottom:12px; margin-bottom:6px; border-bottom:1px solid var(--jl-border); }
        .jl .detail #jl-close {
          margin-left:auto; cursor:pointer; font-size:var(--jl-fs-lg); line-height:1; width:26px; height:26px; border-radius:7px;
          border:1px solid var(--jl-border); background:transparent; color:var(--jl-dim); transition:background .12s, color .12s;
        }
        .jl .detail #jl-close:hover { background:color-mix(in srgb, var(--jl-err) 14%, transparent); color:var(--jl-err); border-color:var(--jl-err); }
        .jl .detail h4 { margin:14px 0 5px; font-size:var(--jl-fs-xs); text-transform:uppercase; letter-spacing:.09em; color:var(--jl-dim); }
        .jl .detail .d-body { font-size:var(--jl-fs); line-height:1.5; white-space:pre-wrap; word-break:break-word; }
        .jl .detail .meta { font-family:var(--jl-mono); font-size:var(--jl-fs-sm); line-height:1.85; color:var(--jl-dim); word-break:break-all; }
        .jl .detail .meta b { color:var(--jl-text); font-weight:600; }
        .jl .scrim { display:none; }
        .jl .detail .d-grip { display:none; }

        .jl .rp { position:relative; display:inline-block; }
        .jl .rp-field {
          font:inherit; font-size:var(--jl-fs); padding:6px 11px; cursor:pointer;
          border:1px solid var(--jl-border); border-radius:9px; background:var(--jl-surface); color:var(--jl-text);
        }
        .jl .rp-pop {
          position:absolute; z-index:30; top:calc(100% + 6px); left:0; display:flex; gap:0;
          border:1px solid var(--jl-border); border-radius:14px; background:var(--jl-surface);
          box-shadow:0 12px 40px -12px rgba(0,0,0,.45); overflow:hidden;
        }
        .jl .rp-pop.hidden { display:none; }
        .jl .rp-presets { display:flex; flex-direction:column; padding:8px; gap:2px; border-right:1px solid var(--jl-border); min-width:130px; }
        .jl .rp-presets button {
          font:inherit; font-size:var(--jl-fs); text-align:left; padding:7px 12px; cursor:pointer;
          border:none; border-radius:8px; background:transparent; color:var(--jl-text);
        }
        .jl .rp-presets button:hover { background:color-mix(in srgb, var(--jl-accent) 12%, transparent); }
        .jl .rp-cal { padding:12px 14px; }
        .jl .rp-cal-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; font-weight:600; }
        .jl .rp-cal-head button { font:inherit; cursor:pointer; border:none; background:transparent; color:var(--jl-text); font-size:var(--jl-fs-lg); width:32px; height:32px; border-radius:8px; }
        .jl .rp-grid { display:grid; grid-template-columns:repeat(7,34px); gap:2px; }
        .jl .rp-grid .dow { text-align:center; font-size:var(--jl-fs-xs); color:var(--jl-dim); padding-bottom:4px; }
        .jl .rp-grid .cell { text-align:center; padding:7px 0; border-radius:8px; cursor:pointer; font-size:var(--jl-fs); }
        .jl .rp-grid .cell.out { color:var(--jl-dim); opacity:.5; }
        .jl .rp-grid .cell:hover { background:color-mix(in srgb, var(--jl-accent) 14%, transparent); }
        .jl .rp-grid .cell.in { background:color-mix(in srgb, var(--jl-accent) 16%, transparent); }
        .jl .rp-grid .cell.edge { background:var(--jl-accent); color:#fff; }

        @container (max-width: 760px) {
          .jl .wrap { flex-direction:column; }
          .jl .trunc { max-width:46vw; }
          .jl .detail {
            position:fixed; inset:auto 0 0 0; width:auto; top:auto; max-height:82vh;
            border-radius:18px 18px 0 0; box-shadow:0 -10px 40px -10px rgba(0,0,0,.5); z-index:20;
            animation:jl-sheet .22s ease both;
          }
          @keyframes jl-sheet { from { transform:translateY(100%); } to { transform:none; } }
          .jl .scrim {
            position:fixed; inset:0; z-index:19; background:rgba(0,0,0,.5);
            -webkit-backdrop-filter:blur(1px); backdrop-filter:blur(1px);
            touch-action:none; animation:jl-fade .18s ease both;
          }
          .jl .scrim.hidden { display:none; }
          .jl .detail { touch-action:none; overscroll-behavior:contain; }
          .jl .detail .d-grip {
            display:block; width:40px; height:4px; margin:-4px auto 10px; border-radius:999px;
            background:var(--jl-border);
          }
        }
        .jl .detail .d-trace {
          display: flex; flex-direction: column; gap: 0;
          border: 1px solid var(--jl-border); border-radius: 9px; overflow: hidden;
        }
        .jl .detail .d-trace-step {
          display: grid; grid-template-columns: 22px 1fr;
          gap: 0 6px; padding: 5px 10px; align-items: baseline;
          border-bottom: 1px solid color-mix(in srgb, var(--jl-border) 50%, transparent);
          font-family: var(--jl-mono); font-size: var(--jl-fs-sm); transition: background .1s;
        }
        .jl .detail .d-trace-step:last-child { border-bottom: none; }
        .jl .detail .d-trace-step:hover {
          background: color-mix(in srgb, var(--jl-accent) 6%, transparent);
        }
        .jl .detail .d-trace-n {
          color: var(--jl-accent); font-weight: 700; font-size: var(--jl-fs-xs);
          text-align: right; padding-top: 1px; opacity: .7;
        }
        .jl .detail .d-trace-name {
          color: var(--jl-text); font-weight: 600; font-size: var(--jl-fs-sm); line-height: 1.35;
        }
        .jl .detail .d-trace-sum {
          grid-column: 2; color: var(--jl-dim); font-size: var(--jl-fs-xs);
          white-space: normal; overflow-wrap: anywhere;
          display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3;
          overflow: hidden; line-height: 1.35; opacity: .8;
        }
      </style>
      <div class="jl">
        <div class="toolbar">
          <div class="stats" id="jl-stats"></div>
          <div class="filters" id="jl-filters"></div>
        </div>
        <div class="scrim hidden" id="jl-scrim"></div>
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
      <span id="jl-range"></span>
      <select id="jl-mode"><option value="">modo: todos</option><option value="power">power</option><option value="fast">fast</option></select>
      <select id="jl-status"><option value="">status: todos</option><option value="ok">ok</option><option value="error">erro</option></select>
      <input type="text" id="jl-q" placeholder="buscar prompt/resposta…">
      <label><input type="checkbox" id="jl-group"> 🧵 agrupar conversa</label>
      <span class="live" id="jl-live"></span>`;
    this.querySelector("#jl-mode").onchange = (e) => { this._filters.mode = e.target.value || undefined; this._renderBody(); };
    this.querySelector("#jl-status").onchange = (e) => { this._filters.status = e.target.value || undefined; this._renderBody(); };
    this.querySelector("#jl-q").oninput = (e) => { this._filters.query = e.target.value || undefined; this._renderBody(); };
    this.querySelector("#jl-group").onchange = (e) => { this._grouped = e.target.checked; this._renderBody(); };
    this._mountRangePickerReplica();
  }

  _mountRangePickerReplica() {
    const host = this.querySelector("#jl-range");
    if (!host) return;
    this._calY = Number(this._to.slice(0, 4));
    this._calM = Number(this._to.slice(5, 7)) - 1;
    this._pick = null; // 1º clique de um novo range
    host.innerHTML = `<div class="rp">
      <button class="rp-field" id="rp-field"></button>
      <div class="rp-pop hidden" id="rp-pop"></div>
    </div>`;
    this._renderRpField();
    this.querySelector("#rp-field").onclick = (e) => {
      e.stopPropagation();
      const pop = this.querySelector("#rp-pop");
      pop.classList.toggle("hidden");
      if (!pop.classList.contains("hidden")) this._renderRpPop();
    };
    if (this._rpOutside) document.removeEventListener("click", this._rpOutside);
    this._rpOutside = (e) => {
      const pop = this.querySelector("#rp-pop");
      const host = this.querySelector("#jl-range");
      if (pop && !pop.classList.contains("hidden") && host && !host.contains(e.target)) pop.classList.add("hidden");
    };
    document.addEventListener("click", this._rpOutside);
  }

  _renderRpField() {
    const f = this.querySelector("#rp-field");
    if (f) f.textContent = this._from === this._to ? this._from : `${this._from} → ${this._to}`;
  }

  _renderRpPop() {
    const pop = this.querySelector("#rp-pop");
    const presets = [["today","Hoje"],["yesterday","Ontem"],["week","Esta semana"],
      ["month","Este mês"],["last7","Últimos 7 dias"],["last30","Últimos 30 dias"]];
    const weeks = monthMatrix(this._calY, this._calM);
    const dow = ["S","T","Q","Q","S","S","D"];
    const monName = new Date(this._calY, this._calM, 1)
      .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const lo = this._from <= this._to ? this._from : this._to;
    const hi = this._from <= this._to ? this._to : this._from;
    pop.innerHTML = `
      <div class="rp-presets">${presets.map(([k,l]) =>
        `<button data-k="${k}">${l}</button>`).join("")}</div>
      <div class="rp-cal">
        <div class="rp-cal-head"><button data-nav="-1">‹</button><span>${monName}</span><button data-nav="1">›</button></div>
        <div class="rp-grid">
          ${dow.map((d) => `<span class="dow">${d}</span>`).join("")}
          ${weeks.flat().map((d) => {
            const iso = localISODate(d);
            const out = d.getMonth() !== this._calM ? "out" : "";
            const edge = (iso === lo || iso === hi) ? "edge" : "";
            const inr = (!edge && iso > lo && iso < hi) ? "in" : "";
            return `<span class="cell ${out} ${inr} ${edge}" data-iso="${iso}">${d.getDate()}</span>`;
          }).join("")}
        </div>
      </div>`;
    pop.querySelectorAll(".rp-presets button").forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const r = presetRange(b.dataset.k);
        this._from = r.from; this._to = r.to; this._pick = null;
        this._renderRpField(); this._renderRpPop(); this._load();
        pop.classList.add("hidden");
      };
    });
    pop.querySelectorAll("[data-nav]").forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        this._calM += Number(b.dataset.nav);
        if (this._calM < 0) { this._calM = 11; this._calY--; }
        if (this._calM > 11) { this._calM = 0; this._calY++; }
        this._renderRpPop();
      };
    });
    pop.querySelectorAll(".cell").forEach((c) => {
      c.onclick = (e) => {
        e.stopPropagation();
        const iso = c.dataset.iso;
        if (this._pick == null) { this._pick = iso; this._from = iso; this._to = iso; }
        else {
          this._from = this._pick <= iso ? this._pick : iso;
          this._to = this._pick <= iso ? iso : this._pick;
          this._pick = null;
          this._load(); pop.classList.add("hidden");
        }
        this._renderRpField(); this._renderRpPop();
      };
    });
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
        tr.onclick = () => { this._markSelected(tr); const t = groupByThread(this._visibleCache).find((x) => x.sessionId === tr.dataset.tk); if (t) this._select(t.records[Number(tr.dataset.i)]); };
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
        <td><span class="mono">${fmtDate(r.ts)}</span></td>
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
      ? `<table><thead><tr><th>Data</th><th>Hora</th><th>Usuário</th><th>Prompt</th><th>Resposta</th><th>Modo</th><th>⏱</th><th>✓</th></tr></thead><tbody>${rows}</tbody></table>${note}`
      : `<p class="empty">Sem interações neste dia.</p>${note}`;
    this.querySelectorAll("#jl-list tbody tr").forEach((tr) => {
      tr.onclick = () => { this._markSelected(tr); this._select(this._visibleCache[Number(tr.dataset.i)]); };
    });
  }

  _select(r) {
    if (!r) return;
    this._selected = r;
    const um = this._um();
    const d = this.querySelector("#jl-detail");
    d.classList.remove("hidden");
    d.innerHTML = `
      <div class="d-grip"></div>
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
      ${r.tools && r.tools.length ? `
        <h4>Raciocínio · ${r.tools.length} chamada${r.tools.length !== 1 ? "s" : ""}</h4>
        <div class="d-trace">
          ${r.tools.map((t, i) => `
            <div class="d-trace-step">
              <span class="d-trace-n">${i + 1}</span>
              <span class="d-trace-name">${this._esc(shortToolName(t.name))}</span>
              ${t.summary ? `<span class="d-trace-sum">${this._esc(t.summary)}</span>` : ""}
            </div>`).join("")}
        </div>` : ""}
      <h4>Metadados</h4>
      <div class="meta">
        dispositivo: <b>${this._esc(r.speakTarget)}</b><br>
        warmState: <b>${this._esc(r.warmState)}</b><br>
        ${r.turnNumber != null ? `turno: <b>${this._esc(r.turnNumber)}</b><br>` : ""}
        ${r.resumed != null ? `sessão: <b>${r.resumed ? "retomada" : "nova"}</b><br>` : ""}
        sessionId: <b>${this._esc(r.sessionId)}</b><br>
        ts: <b>${this._esc(r.ts)}</b>
      </div>`;
    this.querySelector("#jl-close").onclick = () => this._closeSheet();
    this._bindSheetDrag();
    this._openSheet();
  }

  _markSelected(el) {
    if (this._selEl) this._selEl.classList.remove("sel");
    if (el) el.classList.add("sel");
    this._selEl = el;
  }

  _openSheet() {
    const sc = this.querySelector("#jl-scrim");
    if (sc) { sc.classList.remove("hidden"); sc.onclick = () => this._closeSheet(); }
    document.documentElement.classList.add("jl-sheet-open");
  }

  _closeSheet() {
    this._selected = null;
    const d = this.querySelector("#jl-detail");
    if (d) { d.classList.add("hidden"); d.style.transform = ""; }
    const sc = this.querySelector("#jl-scrim");
    if (sc) sc.classList.add("hidden");
    document.documentElement.classList.remove("jl-sheet-open");
    if (this._selEl) { this._selEl.classList.remove("sel"); this._selEl = null; }
  }

  _bindSheetDrag() {
    const d = this.querySelector("#jl-detail");
    if (!d) return;
    let startY = null, dy = 0;
    const grip = d; // arrasta pela área toda do sheet no topo
    const onStart = (e) => {
      if (!e.touches || !e.touches.length) return;
      startY = e.touches[0].clientY; dy = 0; d.style.transition = "none";
    };
    const onMove = (e) => {
      if (startY == null || !e.touches || !e.touches.length) return;
      dy = e.touches[0].clientY - startY;
      if (dy > 0) { d.style.transform = `translateY(${dy}px)`; }
    };
    const onEnd = () => {
      d.style.transition = "";
      if (dy > 90) { this._closeSheet(); }
      else { d.style.transform = ""; }
      startY = null; dy = 0;
    };
    grip.ontouchstart = onStart; grip.ontouchmove = onMove; grip.ontouchend = onEnd;
  }

  _onLive(rec) {
    if (!rec) return;
    const lo = this._from <= this._to ? this._from : this._to;
    const hi = this._from <= this._to ? this._to : this._from;
    const ld = localISODate(rec.ts);
    if (!ld || ld < lo || ld > hi) return;
    this._records.unshift(rec);
    this._renderBody();
    const live = this.querySelector("#jl-live");
    if (live) {
      live.textContent = "ao vivo";
      clearTimeout(this._liveT);
      this._liveT = setTimeout(() => { live.textContent = ""; }, 2500);
    }
  }

  disconnectedCallback() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
    if (this._rpOutside) { document.removeEventListener("click", this._rpOutside); this._rpOutside = null; }
  }
}
customElements.define("jarvis-logbook", JarvisLogbook);
