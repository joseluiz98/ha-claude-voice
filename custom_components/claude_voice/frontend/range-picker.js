import { localISODate, monthMatrix, presetRange, pickerLayout, PICKER_BREAKPOINTS, popoverPosition } from "./format.js";
import { openSheet, closeSheet, currentSheetEl } from "./sheet.js";

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
  constructor({ host, sheetEl, from, to, onChange }) {
    this.host = host;
    this.sheetEl = sheetEl;
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
    // Re-layout (folha <-> popover) não é abandono: preserva o 1º clique
    // pendente, que o fechar() zera de propósito nas rotas de dispensa.
    this._onMq = () => {
      if (!this.aberto) return;
      const pendente = this.pick;
      this.fechar();
      this.abrir();
      this.pick = pendente;
    };
    // Escape fecha nos dois modos. Sem isto, uma sessão só-teclado (janela baixa
    // no desktop => modo folha) não tem NENHUMA saída do picker: clicar fora,
    // arrastar a alça e tocar o backdrop são todos ponteiro/toque.
    this._onEsc = (e) => {
      if (!this.aberto || e.key !== "Escape") return;
      e.stopPropagation();
      this.fechar();
      const f = this.host.querySelector("#rp-field");
      if (f) f.focus();
    };
    // Popover (desktop) é position: fixed na camada superior, sem âncora no
    // fluxo: acompanha o campo quando a janela ou qualquer scroll se mexe.
    this._onReposicionar = () => {
      if (this.aberto && this.modo === "popover") this._posicionar();
    };
    this._mqs = [];
  }

  mount() {
    this.host.innerHTML = `<div class="rp">
      <button type="button" class="rp-field" id="rp-field"></button>
      <div class="rp-pop" id="rp-pop" popover="manual"></div>
    </div>`;
    this._renderCampo();
    this.host.querySelector("#rp-field").onclick = (e) => {
      e.stopPropagation();
      if (this.aberto) this.fechar(); else this.abrir();
    };
    document.addEventListener("click", this._onFora);
    document.addEventListener("keydown", this._onEsc);
    window.addEventListener("resize", this._onReposicionar);
    window.addEventListener("scroll", this._onReposicionar, true);
    this._mqs = CONSULTAS.map((q) => window.matchMedia(q));
    this._mqs.forEach((mq) => mq.addEventListener("change", this._onMq));
  }

  destroy() {
    document.removeEventListener("click", this._onFora);
    document.removeEventListener("keydown", this._onEsc);
    window.removeEventListener("resize", this._onReposicionar);
    window.removeEventListener("scroll", this._onReposicionar, true);
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
      openSheet({
        el: this.sheetEl,
        // rota de dispensa por arrasto, backdrop ou Esc, que não passa por fechar()
        onClose: () => { this.aberto = false; this.pick = null; },
      });
    } else {
      // Camada superior: aberto depois da gaveta do detalhe, fica por cima dela.
      if (!alvo.matches(":popover-open")) alvo.showPopover();
      this._posicionar();
    }
  }

  _posicionar() {
    const pop = this.host.querySelector("#rp-pop");
    const f = this.host.querySelector("#rp-field").getBoundingClientRect();
    const r = pop.getBoundingClientRect();
    const { top, left } = popoverPosition({
      field: { left: f.left, bottom: f.bottom },
      pop: { width: r.width, height: r.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
  }

  fechar() {
    this.aberto = false;
    // Um 1º clique sem 2º é uma interação ABANDONADA. Sem zerar aqui, o
    // primeiro toque da próxima abertura se comporta como 2º clique e fecha um
    // intervalo com uma data que o usuário já desistiu de usar.
    this.pick = null;
    if (this.modo === "sheet") {
      if (currentSheetEl() === this.sheetEl) closeSheet();
    } else {
      const pop = this.host.querySelector("#rp-pop");
      if (pop && pop.matches(":popover-open")) pop.hidePopover();
    }
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
    const miolo = `<div class="rp-inner">
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
    // Na folha o conteúdo vive num único .sheet-body (contrato do sheet.js: clique
    // com alvo no próprio <dialog> = backdrop). No popover fica solto.
    alvo.innerHTML = comAlca ? `<div class="sheet-body"><div class="d-grip"></div>${miolo}</div>` : miolo;
    this._ligar(alvo);
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
