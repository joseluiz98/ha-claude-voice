import { localISODate, monthMatrix, presetRange, pickerLayout, PICKER_BREAKPOINTS } from "./format.js";
import { openSheet, closeSheet, currentSheetEl, bindSheetDrag } from "./sheet.js";

const PRESETS = [
  ["today", "Hoje"], ["yesterday", "Ontem"], ["week", "Esta semana"],
  ["month", "Este mês"], ["last7", "Últimos 7 dias"], ["last30", "Últimos 30 dias"],
];
const DOW = ["S", "T", "Q", "Q", "S", "S", "D"];
// Derivadas de PICKER_BREAKPOINTS (format.js), não repetidas como literais: se
// os limiares do pickerLayout() mudarem, o gatilho de re-layout muda junto.
const CONSULTAS = [
  `(max-width: ${PICKER_BREAKPOINTS.sheetWidth}px)`,
  `(max-height: ${PICKER_BREAKPOINTS.sheetHeight}px)`,
  `(max-width: ${PICKER_BREAKPOINTS.chipsWidth}px)`,
];

export class RangePicker {
  constructor({ host, sheetEl, scrim, from, to, onChange }) {
    this.host = host;
    this.sheetEl = sheetEl;
    this.scrim = scrim;
    this.from = from;
    this.to = to;
    this.onChange = onChange;
    this.aberto = false;
    this.pick = null;               // 1º clique de um novo range
    this.calY = Number(to.slice(0, 4));
    this.calM = Number(to.slice(5, 7)) - 1;
    this._onFora = (e) => {
      if (this.aberto && this.modo === "popover" && !this.host.contains(e.target)) this.fechar();
    };
    this._onMq = () => { if (this.aberto) { this.fechar(); this.abrir(); } };
    this._mqs = [];
  }

  mount() {
    this.host.innerHTML = `<div class="rp">
      <button type="button" class="rp-field" id="rp-field"></button>
      <div class="rp-pop hidden" id="rp-pop"></div>
    </div>`;
    this._renderCampo();
    this.host.querySelector("#rp-field").onclick = (e) => {
      e.stopPropagation();
      if (this.aberto) this.fechar(); else this.abrir();
    };
    document.addEventListener("click", this._onFora);
    this._mqs = CONSULTAS.map((q) => window.matchMedia(q));
    this._mqs.forEach((mq) => mq.addEventListener("change", this._onMq));
  }

  destroy() {
    document.removeEventListener("click", this._onFora);
    this._mqs.forEach((mq) => mq.removeEventListener("change", this._onMq));
    this._mqs = [];
    if (currentSheetEl() === this.sheetEl) closeSheet();
  }

  abrir() {
    const layout = pickerLayout({ width: window.innerWidth, height: window.innerHeight });
    this.modo = layout.container;
    this.aberto = true;
    const alvo = this.modo === "sheet" ? this.sheetEl : this.host.querySelector("#rp-pop");
    alvo.dataset.presets = layout.presets;
    this._renderConteudo(alvo, this.modo === "sheet");
    if (this.modo === "sheet") {
      // #jl-scrim é compartilhado com o detalhe do registro, que também abre
      // via openSheet() — inclusive no desktop, onde ele é coluna lateral, não
      // folha. O marcador [data-rp] existe só enquanto É o picker quem está
      // com a folha aberta, para o CSS decidir visibilidade (e a trava de
      // scroll do <html>) sem reintroduzir o limiar 870/500 duplicado em CSS.
      this.scrim.dataset.rp = "1";
      document.documentElement.classList.add("jl-rp-sheet-open");
      openSheet({
        el: this.sheetEl,
        scrim: this.scrim,
        onClose: () => {
          this.aberto = false;
          delete this.scrim.dataset.rp;
          document.documentElement.classList.remove("jl-rp-sheet-open");
        },
      });
    } else {
      alvo.classList.remove("hidden");
    }
  }

  fechar() {
    this.aberto = false;
    if (this.modo === "sheet") closeSheet();
    else this.host.querySelector("#rp-pop").classList.add("hidden");
  }

  _renderCampo() {
    const f = this.host.querySelector("#rp-field");
    if (f) f.textContent = this.from === this.to ? this.from : `${this.from} → ${this.to}`;
  }

  _renderConteudo(alvo, comAlca) {
    const semanas = monthMatrix(this.calY, this.calM);
    const nomeMes = new Date(this.calY, this.calM, 1)
      .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const lo = this.from <= this.to ? this.from : this.to;
    const hi = this.from <= this.to ? this.to : this.from;
    alvo.innerHTML = `
      ${comAlca ? '<div class="d-grip"></div>' : ""}
      <div class="rp-inner">
        <div class="rp-presets">${PRESETS.map(([k, l]) =>
          `<button type="button" data-k="${k}">${l}</button>`).join("")}</div>
        <div class="rp-cal">
          <div class="rp-cal-head">
            <button type="button" data-nav="-1" aria-label="Mês anterior">‹</button>
            <span>${nomeMes}</span>
            <button type="button" data-nav="1" aria-label="Próximo mês">›</button>
          </div>
          <div class="rp-grid">
            ${DOW.map((d) => `<span class="dow">${d}</span>`).join("")}
            ${semanas.flat().map((d) => {
              const iso = localISODate(d);
              const fora = d.getMonth() !== this.calM ? "out" : "";
              const borda = (iso === lo || iso === hi) ? "edge" : "";
              const dentro = (!borda && iso > lo && iso < hi) ? "in" : "";
              return `<button type="button" class="cell ${fora} ${dentro} ${borda}" data-iso="${iso}">${d.getDate()}</button>`;
            }).join("")}
          </div>
        </div>
      </div>`;
    this._ligar(alvo);
    // _renderConteudo() reescreve alvo.innerHTML por inteiro — inclusive numa
    // navegação de mês ou no 1º clique de um novo range — o que troca o nó
    // .d-grip e derruba os handlers de touch que o openSheet() ligou na
    // abertura. Rebind idempotente: sem custo perceptível, e sem isto o
    // arrastar-para-fechar morre no primeiro re-render.
    if (comAlca) bindSheetDrag(alvo);
  }

  _ligar(alvo) {
    alvo.querySelectorAll(".rp-presets button").forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const r = presetRange(b.dataset.k);
        this.from = r.from; this.to = r.to; this.pick = null;
        this.calY = Number(this.to.slice(0, 4));
        this.calM = Number(this.to.slice(5, 7)) - 1;
        this._renderCampo();
        this.fechar();
        this.onChange(this.from, this.to);
      };
    });
    alvo.querySelectorAll("[data-nav]").forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        this.calM += Number(b.dataset.nav);
        if (this.calM < 0) { this.calM = 11; this.calY -= 1; }
        if (this.calM > 11) { this.calM = 0; this.calY += 1; }
        this._renderConteudo(alvo, this.modo === "sheet");
      };
    });
    alvo.querySelectorAll(".cell").forEach((c) => {
      c.onclick = (e) => {
        e.stopPropagation();
        const iso = c.dataset.iso;
        if (this.pick == null) {
          this.pick = iso; this.from = iso; this.to = iso;
          this._renderCampo();
          this._renderConteudo(alvo, this.modo === "sheet");
          return;
        }
        this.from = this.pick <= iso ? this.pick : iso;
        this.to = this.pick <= iso ? iso : this.pick;
        this.pick = null;
        this._renderCampo();
        this.fechar();
        this.onChange(this.from, this.to);
      };
    });
  }
}
