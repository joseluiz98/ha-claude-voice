import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { openSheet, closeSheet, currentSheetEl, releaseSheet } from "../frontend/sheet.js";

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

// Rota da mudança de regime (girar o aparelho cruza os 760px): o detalhe deixa
// de ser desenhado como folha e vira coluna lateral, mas continua na tela.
test("release solta scrim e trava de scroll sem esconder a folha nem disparar onClose", () => {
  const el = fakeEl(); const scrim = fakeEl();
  let n = 0;
  openSheet({ el, scrim, onClose: () => { n += 1; } });
  releaseSheet(el);
  assert.equal(currentSheetEl(), null, "deixa de ser a folha corrente");
  assert.equal(el.tem("hidden"), false, "o elemento continua visível — vira coluna");
  assert.equal(scrim.tem("hidden"), true, "o scrim é do regime folha");
  assert.equal(
    document.documentElement.classList.contains("jl-sheet-open"), false,
    "a trava de scroll do <html> é compartilhada com o HA inteiro e não pode ficar presa"
  );
  assert.equal(n, 0, "não é um fechamento: a seleção do usuário sobrevive");
});

test("release de quem não é a folha corrente é no-op", () => {
  const a = fakeEl(); const b = fakeEl(); const scrim = fakeEl();
  openSheet({ el: a, scrim });
  releaseSheet(b);
  assert.equal(currentSheetEl(), a, "a folha alheia continua registrada");
  assert.equal(scrim.tem("hidden"), false);
  assert.equal(document.documentElement.classList.contains("jl-sheet-open"), true);
});
