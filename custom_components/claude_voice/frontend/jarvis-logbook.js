import {
  resolveUserName, fmtDuration, fmtTime, fmtDate, localISODate,
  applyFilters, computeStats, groupByThread, presetRange, monthMatrix, shouldShowMenu,
} from "./format.js";
import { CSS } from "./styles.js";

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
    this._narrow = false;
  }

  set hass(hass) {
    this._hass = hass;
    this._syncHeader();
    if (this._inited) return;
    this._inited = true;
    this._render();
    this._syncHeader();
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

  set narrow(v) { this._narrow = !!v; this._syncHeader(); }
  get narrow() { return this._narrow; }

  // No-op enquanto o header não existir no DOM: a primeira chamada de `set hass`
  // acontece antes do _render(). Assim a ordem de chegada de `hass` e `narrow`,
  // que o HA não garante, deixa de importar.
  _syncHeader() {
    const root = this.querySelector(".jl");
    if (!root) return;
    const show = shouldShowMenu({
      narrow: this._narrow,
      dockedSidebar: this._hass && this._hass.dockedSidebar,
    });
    root.dataset.menu = show ? "1" : "0";
  }

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
    this._closeSheet();
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
      <style>${CSS}</style>
      <div class="jl">
        <div class="jl-hdr">
          <button class="jl-menu" id="jl-menu" aria-label="Abrir menu" title="Abrir menu">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path d="M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z"></path>
            </svg>
          </button>
          <div class="jl-title">Jarvis Logbook</div>
        </div>
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
    // bubbles + composed é o que faz o evento atravessar o shadow DOM do
    // ha-panel-custom e chegar ao <home-assistant>, que é quem escuta.
    this.querySelector("#jl-menu").onclick = () => {
      this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true }));
    };
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
          <tr data-tk="${this._esc(t.sessionId)}" data-i="${i}" class="${r.ok ? "" : "err"} ${this._selected === r ? "sel" : ""}">
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
      this._selEl = this.querySelector("#jl-list tr.sel") || null;
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
    this._selEl = this.querySelector("#jl-list tr.sel") || null;
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
    const grip = d.querySelector(".d-grip");
    if (!grip) return;
    let startY = null, dy = 0;
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
    document.documentElement.classList.remove("jl-sheet-open");
    clearTimeout(this._liveT);
  }
}
customElements.define("jarvis-logbook", JarvisLogbook);
