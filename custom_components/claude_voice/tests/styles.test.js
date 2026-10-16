import assert from "node:assert/strict";
import { test } from "node:test";
import { CSS } from "../frontend/styles.js";
import { MOBILE_QUERY } from "../frontend/format.js";

test("CSS é uma string e não carrega as tags <style>", () => {
  assert.equal(typeof CSS, "string");
  assert.ok(!CSS.includes("<style"), "as tags <style> não devem entrar na string");
});

test("CSS mantém as âncoras estruturais do painel", () => {
  for (const ancora of [".jl .toolbar", ".jl .stats", ".jl .filters", ".jl .detail", ".jl .rp-pop"]) {
    assert.ok(CSS.includes(ancora), `âncora ausente: ${ancora}`);
  }
});

// Guarda de regressão: estes bugs já apareceram em produção (prints de
// 2026-08-11). O teste não valida renderização — valida que a regra que os
// causa não voltou, e que a que os impede continua no arquivo.

// O defeito real do campo de data: `.jl .filters button { width:32px }` nasceu
// quando .filters só tinha <input type="date">, e passou a casar no campo (que
// hoje é <button class="rp-field">) — com 2 classes + 1 tipo, vencendo os
// blocos .jl .rp-field, de 2 classes. Daí a caixa de 32px, o texto vazando
// sobre o <select> vizinho e, depois do overflow:hidden, as reticências.
// Qualquer seletor de botão genérico nesse escopo reintroduz o bug: o popover
// do picker (presets, setas de mês, células) também vive dentro de .filters.
// Um teste que congelasse a correção anterior (#jl-range com flex:0 0 auto)
// passaria com o defeito presente — flex no <span> não desfaz width no <button>.
test("nenhuma regra genérica de botão dentro de .filters dimensiona os botões", () => {
  const genericas = CSS.match(/\.filters\s+button[^{,]*\{[^}]*\}/g) || [];
  assert.deepEqual(
    genericas, [],
    "estilo de botão dentro de .filters tem que ser por id/classe — um seletor " +
    "genérico casa no campo de data e no popover do picker e vence por especificidade"
  );
});

test("o campo de data tem largura de conteúdo, num bloco só", () => {
  const blocos = CSS.match(/\.rp-field\s*\{[^}]*\}/g) || [];
  assert.equal(blocos.length, 1, "os dois blocos .rp-field precisam continuar fundidos");
  assert.match(blocos[0], /white-space:\s*nowrap/, "a data não pode quebrar linha");
  assert.doesNotMatch(
    blocos[0], /(^|[;{\s])width:/,
    "o campo é dimensionado pelo conteúdo — largura fixa foi exatamente o bug"
  );
});

test("CSS trava o encolhimento dos presets", () => {
  // Regex tolerante a formatação de propósito: pega a remoção da regra, mas
  // sobrevive a reordenar ou acrescentar declarações dentro do mesmo bloco.
  assert.match(
    CSS,
    /\.rp-presets button\s*\{[^}]*flex:\s*0 0 auto/,
    "os presets precisam de flex:0 0 auto, senão são comprimidos e o texto se sobrepõe"
  );
});

// O outro botão que a regra órfã esmagava, sem overflow:hidden para conter o
// estrago: jarvis-logbook.js injeta "↻ atualizar" dentro de #jl-live quando a
// inscrição de realtime falha, e #jl-live está dentro de .filters.
test("o botão de atualizar (fallback sem realtime) tem estilo próprio", () => {
  assert.match(CSS, /#jl-refresh\s*\{[^}]*padding:/, "precisa de caixa por padding, não quadrada");
});

test("CSS respeita prefers-reduced-motion", () => {
  assert.ok(
    CSS.includes("prefers-reduced-motion"),
    "o painel tem uma animação infinita (jl-pulse) e precisa da guarda"
  );
});

test("folhas do celular: dialog modal a 90% da altura visível, presas ao rodapé", () => {
  assert.match(CSS, /\.jl \.detail:modal, \.jl \.rp-sheet:modal\s*\{[^}]*height:\s*90dvh/);
  assert.ok(CSS.includes("::backdrop"), "o fundo escuro vem do ::backdrop");
});

test("gaveta do desktop: popover aberto à direita, do topo ao rodapé, sem fundo", () => {
  assert.match(CSS, /\.jl \.detail:popover-open\s*\{[^}]*width:\s*min\(480px,\s*40vw\)/);
  assert.match(CSS, /\.jl \.detail:popover-open\s*\{[^}]*height:\s*100dvh/);
});

test("dialog/popover fechado continua escondido mesmo com display do autor", () => {
  assert.match(CSS, /\.jl dialog:not\(\[open\]\):not\(:popover-open\)[^{]*\{[^}]*display:\s*none/);
  assert.match(CSS, /\.jl \.rp-pop:not\(:popover-open\)\s*\{[^}]*display:\s*none/);
});

test("header e toolbar deixam de ser fixos no regime celular", () => {
  const q = MOBILE_QUERY.replace(/[()]/g, "\\$&");
  assert.match(CSS, new RegExp(`@media ${q}\\s*\\{[\\s\\S]*?\\.jl \\.jl-hdr, \\.jl \\.toolbar\\s*\\{[^}]*position:\\s*static`));
});

test("o scrim antigo e a coluna sticky do detalhe saíram", () => {
  assert.ok(!CSS.includes(".scrim"), "o #jl-scrim não existe mais");
  assert.ok(!CSS.includes("jl-rp-sheet-open"), "a trava de scroll é uma só (jl-sheet-open)");
  assert.ok(!/\.jl \.detail\s*\{[^}]*position:\s*sticky/.test(CSS), "o detalhe não é mais coluna sticky");
});

test("nenhum overflow-x em .jl (armadilha registrada)", () => {
  assert.ok(!/\.jl\s*\{[^}]*overflow-x/.test(CSS));
});
