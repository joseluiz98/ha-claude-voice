import assert from "node:assert/strict";
import { test } from "node:test";
import { CSS } from "../frontend/styles.js";

test("CSS é uma string e não carrega as tags <style>", () => {
  assert.equal(typeof CSS, "string");
  assert.ok(!CSS.includes("<style"), "as tags <style> não devem entrar na string");
});

test("CSS mantém as âncoras estruturais do painel", () => {
  for (const ancora of [".jl .toolbar", ".jl .stats", ".jl .filters", ".jl .detail", ".jl .rp-pop"]) {
    assert.ok(CSS.includes(ancora), `âncora ausente: ${ancora}`);
  }
});

// Guarda de regressão: estes dois bugs já apareceram em produção (prints de
// 2026-08-11). O teste não valida renderização — valida que a regra que os
// impede continua no arquivo.
test("CSS trava o encolhimento do campo de data e dos presets", () => {
  // Regex tolerante a formatação de propósito: pega a remoção da regra, mas
  // sobrevive a reordenar ou acrescentar declarações dentro do mesmo bloco.
  assert.match(
    CSS,
    /#jl-range\s*\{[^}]*flex:\s*0 0 auto/,
    "o campo de data precisa de flex:0 0 auto, senão vaza sobre o select vizinho"
  );
  assert.match(
    CSS,
    /\.rp-presets button\s*\{[^}]*flex:\s*0 0 auto/,
    "os presets precisam de flex:0 0 auto, senão são comprimidos e o texto se sobrepõe"
  );
});

test("CSS respeita prefers-reduced-motion", () => {
  assert.ok(
    CSS.includes("prefers-reduced-motion"),
    "o painel tem uma animação infinita (jl-pulse) e precisa da guarda"
  );
});
