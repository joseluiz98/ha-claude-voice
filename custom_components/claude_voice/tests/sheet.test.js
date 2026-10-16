import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { openSheet, closeSheet, currentSheetEl } from "../frontend/sheet.js";

function fakeEl() {
  const ouvintes = {};
  return {
    open: false,
    style: {},
    showModal() { if (this.open) throw new Error("InvalidStateError"); this.open = true; },
    close() { this.open = false; },
    addEventListener(tipo, fn) { (ouvintes[tipo] = ouvintes[tipo] || []).push(fn); },
    dispara(tipo, ev) { (ouvintes[tipo] || []).forEach((fn) => fn(ev)); },
    querySelector: () => null,
    getBoundingClientRect: () => ({ width: 390 }),
  };
}

// folha com conteúdo rolável (.sheet-body) para o gesto de arrastar
function fakeFolha(scrollTop = 0) {
  const el = fakeEl();
  const corpo = { scrollTop };
  el.querySelector = (s) => (s === ".sheet-body" ? corpo : null);
  return el;
}
function toque(y) { return { touches: [{ clientY: y }] }; }

beforeEach(() => {
  globalThis.window = { innerWidth: 390 };
  const raiz = new Set();
  globalThis.document = {
    documentElement: {
      classList: { add: (c) => raiz.add(c), remove: (c) => raiz.delete(c), contains: (c) => raiz.has(c) },
    },
  };
  closeSheet();
});

test("abrir chama showModal e trava o scroll; fechar chama close e solta", () => {
  const el = fakeEl();
  openSheet({ el });
  assert.equal(el.open, true);
  assert.equal(currentSheetEl(), el);
  assert.equal(document.documentElement.classList.contains("jl-sheet-open"), true);
  closeSheet();
  assert.equal(el.open, false);
  assert.equal(document.documentElement.classList.contains("jl-sheet-open"), false);
});

test("abrir a segunda folha fecha a primeira — nunca duas empilhadas", () => {
  const a = fakeEl(); const b = fakeEl();
  openSheet({ el: a });
  openSheet({ el: b });
  assert.equal(a.open, false, "a primeira folha precisa fechar");
  assert.equal(b.open, true);
  assert.equal(currentSheetEl(), b);
  assert.equal(document.documentElement.classList.contains("jl-sheet-open"), true);
});

test("fechar dispara onClose uma vez só, sem recursão", () => {
  const el = fakeEl();
  let n = 0;
  // onClose que chama closeSheet() de volta é o caso real: o painel limpa a
  // seleção nesse callback e algumas rotas chamam closeSheet() de novo.
  openSheet({ el, onClose: () => { n += 1; closeSheet(); } });
  closeSheet();
  assert.equal(n, 1);
  assert.equal(document.documentElement.classList.contains("jl-sheet-open"), false);
});

test("fechar sem folha aberta é no-op", () => {
  closeSheet();
  assert.equal(currentSheetEl(), null);
});

test("cancel nativo passa por closeSheet e solta a trava", () => {
  const el = fakeEl(); let fechou = 0; let prevenido = false;
  openSheet({ el, onClose: () => fechou++ });
  el.dispara("cancel", { preventDefault: () => { prevenido = true; } });
  assert.equal(prevenido, true);
  assert.equal(fechou, 1);
  assert.equal(el.open, false);
  assert.equal(currentSheetEl(), null);
  assert.equal(document.documentElement.classList.contains("jl-sheet-open"), false);
});

test("clique no conteúdo não fecha; clique no backdrop fecha", () => {
  const el = fakeEl();
  openSheet({ el });
  el.dispara("click", { target: { nome: "sheet-body" } });
  assert.equal(el.open, true);
  el.dispara("click", { target: el });
  assert.equal(el.open, false);
});

test("reabrir não duplica o fechamento pelo cancel", () => {
  const el = fakeEl(); let fechou = 0;
  openSheet({ el, onClose: () => fechou++ });
  closeSheet();
  fechou = 0;
  openSheet({ el, onClose: () => fechou++ });
  el.dispara("cancel", { preventDefault() {} });
  assert.equal(fechou, 1);
});

test("abrir a mesma folha aberta de novo não lança (showModal só se fechada)", () => {
  const el = fakeEl();
  openSheet({ el });
  openSheet({ el });
  assert.equal(el.open, true);
});

test("arrastar selecionando texto e soltar no fundo não fecha (o clique nasceu no conteúdo)", () => {
  const el = fakeEl();
  openSheet({ el });
  el.dispara("pointerdown", { target: { nome: "texto" } });
  el.dispara("click", { target: el });
  assert.equal(el.open, true);
  el.dispara("pointerdown", { target: el });
  el.dispara("click", { target: el });
  assert.equal(el.open, false);
});

test("puxar a folha para baixo com o conteúdo no topo fecha e bloqueia o pull-to-refresh", () => {
  const el = fakeFolha(0); let bloqueou = 0;
  openSheet({ el });
  el.ontouchstart(toque(100));
  el.ontouchmove({ ...toque(160), preventDefault: () => bloqueou++ });
  el.ontouchmove({ ...toque(250), preventDefault: () => bloqueou++ });
  assert.equal(el.style.transform, "translateY(150px)");
  el.ontouchend({});
  assert.equal(bloqueou, 2, "o gesto é da folha, não do navegador");
  assert.equal(el.open, false);
});

test("puxar pouco devolve a folha ao lugar", () => {
  const el = fakeFolha(0);
  openSheet({ el });
  el.ontouchstart(toque(100));
  el.ontouchmove({ ...toque(140), preventDefault() {} });
  el.ontouchend({});
  assert.equal(el.open, true);
  assert.equal(el.style.transform, "");
});

test("com o conteúdo rolado, puxar para baixo rola o conteúdo e não arrasta a folha", () => {
  const el = fakeFolha(300); let bloqueou = 0;
  openSheet({ el });
  el.ontouchstart(toque(100));
  el.ontouchmove({ ...toque(250), preventDefault: () => bloqueou++ });
  el.ontouchend({});
  assert.equal(bloqueou, 0);
  assert.equal(el.open, true);
});

test("gaveta (não ocupa a largura toda) não arrasta", () => {
  const el = fakeFolha(0);
  el.getBoundingClientRect = () => ({ width: 480 });
  globalThis.window.innerWidth = 1280;
  openSheet({ el });
  el.ontouchstart(toque(100));
  el.ontouchmove({ ...toque(250), preventDefault() {} });
  el.ontouchend({});
  assert.equal(el.open, true);
});
