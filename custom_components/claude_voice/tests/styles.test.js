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
