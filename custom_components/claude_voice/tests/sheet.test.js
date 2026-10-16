import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { openSheet, closeSheet, currentSheetEl, releaseSheet } from "../frontend/sheet.js";

function fakeEl() {
  const ouvintes = {};
  return {
    open: false,
    style: {},
    showModal() { if (this.open) throw new Error("InvalidStateError"); this.open = true; },
    close() { this.open = false; },
    addEventListener(tipo, fn) { (ouvintes[tipo] = ouvintes[tipo] || []).push(fn); },
    dispara(tipo, ev) { (ouvintes[tipo] || []).forEach((fn) => fn(ev)); },
    querySelector: () => null,   // sem .d-grip: bindSheetDrag sai cedo
  };
}

beforeEach(() => {
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

test("troca de regime com o detalhe aberto: release e reabertura", () => {
  const el = fakeEl(); let fechou = 0;
  openSheet({ el, onClose: () => fechou++ });
  releaseSheet(el);
  assert.equal(el.open, false);
  assert.equal(fechou, 0);                       // a seleção do usuário não é limpa
  assert.equal(currentSheetEl(), null);
  assert.equal(document.documentElement.classList.contains("jl-sheet-open"), false);
  openSheet({ el });                             // voltar ao regime folha reabre sem erro
  assert.equal(el.open, true);
});

test("release de quem não é a folha corrente é no-op", () => {
  const a = fakeEl(); const b = fakeEl();
  openSheet({ el: a });
  releaseSheet(b);
  assert.equal(currentSheetEl(), a, "a folha alheia continua registrada");
  assert.equal(a.open, true);
  assert.equal(document.documentElement.classList.contains("jl-sheet-open"), true);
});
