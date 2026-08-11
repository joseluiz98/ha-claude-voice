import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { openSheet, closeSheet, currentSheetEl } from "../frontend/sheet.js";

function fakeEl() {
  const classes = new Set(["hidden"]);
  return {
    style: {},
    onclick: null,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    // bindDrag procura a alça; sem ela o binding sai cedo
    querySelector: () => null,
    tem: (c) => classes.has(c),
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

test("abrir mostra a folha, mostra o scrim e trava o scroll da página", () => {
  const el = fakeEl(); const scrim = fakeEl();
  openSheet({ el, scrim });
  assert.equal(el.tem("hidden"), false);
  assert.equal(scrim.tem("hidden"), false);
  assert.equal(document.documentElement.classList.contains("jl-sheet-open"), true);
  assert.equal(currentSheetEl(), el);
});

test("abrir a segunda folha fecha a primeira — nunca duas empilhadas", () => {
  const a = fakeEl(); const b = fakeEl(); const scrim = fakeEl();
  openSheet({ el: a, scrim });
  openSheet({ el: b, scrim });
  assert.equal(a.tem("hidden"), true, "a primeira folha precisa fechar");
  assert.equal(b.tem("hidden"), false);
  assert.equal(scrim.tem("hidden"), false, "o scrim segue visível para a segunda");
  assert.equal(currentSheetEl(), b);
});

test("fechar dispara onClose uma vez só, sem recursão", () => {
  const el = fakeEl(); const scrim = fakeEl();
  let n = 0;
  // onClose que chama closeSheet() de volta é o caso real: o painel limpa a
  // seleção nesse callback e algumas rotas chamam closeSheet() de novo.
  openSheet({ el, scrim, onClose: () => { n += 1; closeSheet(); } });
  closeSheet();
  assert.equal(n, 1);
  assert.equal(document.documentElement.classList.contains("jl-sheet-open"), false);
});

test("fechar sem folha aberta é no-op", () => {
  closeSheet();
  assert.equal(currentSheetEl(), null);
});
