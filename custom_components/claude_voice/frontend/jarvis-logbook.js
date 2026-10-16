import {
  resolveUserName, fmtDuration, fmtTime, fmtDate, localISODate,
  applyFilters, computeStats, groupByThread, shouldShowMenu, detailLayout,
  MOBILE_QUERY, stepSelection, ignoresArrowKeys, escTarget, stickyScrollMargin, keyTargetsPanel,
} from "./format.js";
import { CSS } from "./styles.js";
import { openSheet, closeSheet, currentSheetEl, releaseSheet } from "./sheet.js";
import { RangePicker } from "./range-picker.js";

// Derivada do regime celular (format.js), não repetida como literal — mesmo
// contrato que o range-picker.js tem com PICKER_BREAKPOINTS: se o limiar mudar,
// o gatilho de reconciliação muda junto.
const CONSULTA_DETALHE = MOBILE_QUERY;

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
    this._fecharDetalhe();
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
        <dialog class="rp-sheet" id="jl-rp-sheet"></dialog>
        <div class="wrap">
          <div class="list" id="jl-list"></div>
        </div>
        <dialog class="detail" id="jl-detail" popover="manual"></dialog>
      </div>`;
    // bubbles + composed é o que faz o evento atravessar o shadow DOM do
    // ha-panel-custom e chegar ao <home-assistant>, que é quem escuta.
    this.querySelector("#jl-menu").onclick = () => {
      this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true }));
    };
    this._montarObservadorDeRegime();
    this._buildFilters();
    this._renderBody();
    this._montarTeclado();
  }

  // Teclado da gaveta (spec §4.4). Registrado na fase de CAPTURA: o _onEsc do
  // seletor é de bolha; sem a captura ele fecharia primeiro, o escTarget veria
  // pickerOpen:false e o mesmo Esc fecharia a gaveta também.
  _montarTeclado() {
    if (this._onTecla) return;
    this._onTecla = (e) => {
      const d = this.querySelector("#jl-detail");
      // só a gaveta: na folha, o Esc é o "cancel" do <dialog> (sheet.js)
      if (!d || !d.matches(":popover-open")) return;
      const caminho = e.composedPath ? e.composedPath() : [e.target];
      // o listener é do document: tecla de diálogo do HA ou da sidebar não é nossa
      if (e.defaultPrevented || !keyTargetsPanel(caminho, this)) return;
      if (e.key === "Escape") {
        const quem = escTarget({ pickerOpen: !!(this._rp && this._rp.aberto), drawerOpen: true });
        if (quem === "drawer") { e.preventDefault(); this._fecharDetalhe(); }
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      // O painel vive no shadow DOM do ha-panel-custom: document.activeElement
      // seria o host <home-assistant>. O alvo real do evento é composedPath()[0].
      // seletor de datas aberto: as setas são dele (rolar a folha), não do registro
      if (this._rp && this._rp.aberto) return;
      const alvo = caminho[0];
      if (ignoresArrowKeys((alvo && alvo.tagName) || "", alvo && alvo.type)) return;
      const r = stepSelection(this._ordem || [], this._selected, e.key === "ArrowDown" ? 1 : -1);
      if (!r) return;
      e.preventDefault();
      const tr = this.querySelector(`#jl-list tr[data-o="${this._ordem.indexOf(r)}"]`);
      this._markSelected(tr);
      if (tr) {
        const tb = this.querySelector(".toolbar");
        tr.style.scrollMarginTop = stickyScrollMargin({
          drawer: !this._detalheEhFolha(), toolbarBottom: tb ? tb.getBoundingClientRect().bottom : 0,
        }) + "px";
        tr.scrollIntoView({ block: "nearest" });
      }
      this._select(r);
    };
    document.addEventListener("keydown", this._onTecla, { capture: true });
  }

  // Girar o aparelho cruza os 760px nas duas direções (iPhone: 844px deitado,
  // 390px em pé), e o CSS troca o desenho do .detail sozinho — coluna lateral
  // acima do limiar, folha abaixo. Sem observar isso, o sheet.js ficava sabendo
  // apenas do regime vigente na hora de ABRIR: um detalhe aberto deitado e
  // girado para retrato virava folha à revelia do mecanismo, e abrir o seletor
  // de datas nesse estado empilhava duas folhas.
  // Montado aqui (uma vez, junto com o resto) e desmontado no
  // disconnectedCallback, no mesmo ciclo de vida do realtime e do RangePicker.
  // Registrado ANTES do _buildFilters(): assim, numa rotação com o picker
  // aberto, o detalhe reassume a folha primeiro e o _onMq do picker sai cedo
  // (this.aberto já é false) em vez de reabrir uma folha que seria fechada logo
  // em seguida.
  _montarObservadorDeRegime() {
    if (this._mqDetalhe) return;
    this._mqDetalhe = window.matchMedia(CONSULTA_DETALHE);
    this._onRegime = () => this._reconciliarDetalhe();
    this._mqDetalhe.addEventListener("change", this._onRegime);
  }

  // Girar o aparelho / redimensionar: o mesmo registro continua aberto no outro
  // modo (folha <-> gaveta). Fechar ao cruzar o limiar apagaria a leitura em
  // curso e a seleção por um motivo que, para o usuário, é só "virei o telefone".
  _reconciliarDetalhe() {
    const d = this.querySelector("#jl-detail");
    if (!d || !this._selected || !this._detalheAberto(d)) return;
    this._mostrarDetalhe();
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
    if (this._rp) this._rp.destroy();
    this._rp = new RangePicker({
      host: this.querySelector("#jl-range"),
      sheetEl: this.querySelector("#jl-rp-sheet"),
      from: this._from,
      to: this._to,
      onChange: (from, to) => { this._from = from; this._to = to; this._load(); },
    });
    this._rp.mount();
  }

  _renderBody() {
    if (!this.querySelector("#jl-list")) return;
    const um = this._um();
    const recs = applyFilters(this._records, this._filters);
    const multiDia = this._from !== this._to;
    if (this._grouped) {
      const threads = groupByThread(recs);
      // Ordem visível (↑/↓ da gaveta): a das linhas como desenhadas.
      this._ordem = threads.flatMap((t) => t.records);
      let o = 0;
      this.querySelector("#jl-list").innerHTML = threads.map((t) => {
        const head = t.records[0] || {};
        const inner = t.records.map((r) => `
          <tr data-o="${o++}" tabindex="-1" class="${r.ok ? "" : "err"} ${this._selected === r ? "sel" : ""}">
            <td class="c-hora"><span class="mono" style="padding-left:14px">${fmtTime(r.ts)}</span>${
              multiDia ? `<small class="c-day" style="padding-left:14px">${fmtDate(r.ts)}</small>` : ""
            }</td>
            <td class="trunc c-prompt">${this._esc(r.prompt)}</td>
            <td class="trunc c-resp">${this._esc(r.response || (r.error ? "erro: " + r.error : ""))}</td>
            <td class="c-dur"><span class="mono">${fmtDuration(r.durationMs)}</span></td>
          </tr>`).join("");
        return `<table><thead><tr><th colspan="4">🧵 ${this._esc(resolveUserName(head.sessionKey, um))} ·
          ${fmtTime(head.ts)} · ${t.records.length} turno(s) · <small>${this._esc(t.sessionId)}</small></th></tr></thead>
          <tbody>${inner}</tbody></table>`;
      }).join("") || `<p class="empty">Sem interações neste dia.</p>`;
      this.querySelectorAll("#jl-list tbody tr").forEach((tr) => {
        tr.onclick = () => { this._markSelected(tr); this._select(this._ordem[Number(tr.dataset.o)]); };
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

    this._ordem = recs;
    const rows = recs.map((r, i) => `
      <tr data-o="${i}" tabindex="-1" class="${r.ok ? "" : "err"} ${this._selected === r ? "sel" : ""}">
        <td class="c-data"><span class="mono">${fmtDate(r.ts)}</span></td>
        <td class="c-hora"><span class="mono">${fmtTime(r.ts)}</span>${
          multiDia ? `<small class="c-day">${fmtDate(r.ts)}</small>` : ""
        }</td>
        <td class="c-user">${this._esc(resolveUserName(r.sessionKey, um))}</td>
        <td class="trunc c-prompt">${this._esc(r.prompt)}</td>
        <td class="trunc c-resp">${this._esc(r.response || (r.error ? "erro: " + r.error : ""))}</td>
        <td class="c-mode"><span class="${this._badgeCls(r.mode)}">${this._esc(r.mode || "—")}</span></td>
        <td class="c-dur"><span class="mono">${fmtDuration(r.durationMs)}</span></td>
        <td class="c-status"><span class="dot ${r.ok ? "ok" : "err"}"></span></td>
      </tr>`).join("");
    const note = this._unreadable ? `<p class="note">${this._unreadable} linha(s) ilegíveis ignoradas</p>` : "";
    this.querySelector("#jl-list").innerHTML = recs.length
      ? `<table><thead><tr><th class="c-data">Data</th><th class="c-hora">Hora</th><th class="c-user">Usuário</th><th class="c-prompt">Prompt</th><th class="c-resp">Resposta</th><th class="c-mode">Modo</th><th class="c-dur">⏱</th><th class="c-status">✓</th></tr></thead><tbody>${rows}</tbody></table>${note}`
      : `<p class="empty">Sem interações neste dia.</p>${note}`;
    this.querySelectorAll("#jl-list tbody tr").forEach((tr) => {
      tr.onclick = () => { this._markSelected(tr); this._select(this._ordem[Number(tr.dataset.o)]); };
    });
    this._selEl = this.querySelector("#jl-list tr.sel") || null;
  }

  _select(r) {
    if (!r) return;
    this._selected = r;
    const um = this._um();
    const d = this.querySelector("#jl-detail");
    d.innerHTML = `<div class="sheet-body">
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
      </div></div>`;
    this.querySelector("#jl-close").onclick = () => this._fecharDetalhe();
    this._mostrarDetalhe();
  }

  _markSelected(el) {
    if (this._selEl) this._selEl.classList.remove("sel");
    if (el) el.classList.add("sel");
    this._selEl = el;
  }

  // Folha no regime celular (largura OU altura baixa), gaveta no desktop.
  // Consultar na hora (e não guardar) porque o usuário redimensiona a janela
  // com o painel aberto.
  _detalheEhFolha() {
    return detailLayout({ width: window.innerWidth, height: window.innerHeight }) === "sheet";
  }

  _detalheAberto(d) {
    return d.open || d.matches(":popover-open");
  }

  _limparSelecao() {
    this._selected = null;
    if (this._selEl) { this._selEl.classList.remove("sel"); this._selEl = null; }
  }

  // Folha (celular) = <dialog> modal; gaveta (desktop) = popover manual. Os dois
  // vivem na camada superior: nenhum ancestral nem o scroll mexem na posição.
  _mostrarDetalhe() {
    const d = this.querySelector("#jl-detail");
    if (this._detalheEhFolha()) {
      if (d.matches(":popover-open")) d.hidePopover();
      openSheet({ el: d, onClose: () => this._aoFecharDetalhe() });
    } else {
      if (currentSheetEl() === d) releaseSheet(d);
      if (!d.matches(":popover-open")) d.showPopover();
    }
  }

  _fecharDetalhe() {
    const d = this.querySelector("#jl-detail");
    if (!d) return;
    // Só fecha pelo sheet.js se a folha corrente for MESMO o detalhe: senão um
    // _load() (disparado pelo próprio picker, ao escolher um range) fecharia a
    // folha do picker por tabela.
    if (currentSheetEl() === d) { closeSheet(); return; }   // onClose -> _aoFecharDetalhe
    if (d.matches(":popover-open")) d.hidePopover();
    this._aoFecharDetalhe();
  }

  _aoFecharDetalhe() {
    const tr = this._selEl;
    this._limparSelecao();
    if (tr && tr.isConnected) tr.focus({ preventScroll: true });
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
    if (this._rp) { this._rp.destroy(); this._rp = null; }
    if (this._mqDetalhe) {
      this._mqDetalhe.removeEventListener("change", this._onRegime);
      this._mqDetalhe = null;
      this._onRegime = null;
    }
    if (this._onTecla) {
      document.removeEventListener("keydown", this._onTecla, { capture: true });
      this._onTecla = null;
    }
    this._fecharDetalhe();
    closeSheet();
    clearTimeout(this._liveT);
  }
}
customElements.define("jarvis-logbook", JarvisLogbook);
