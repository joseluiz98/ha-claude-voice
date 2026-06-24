import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveUserName, fmtDuration, applyFilters, computeStats, groupByThread,
} from "../frontend/format.js";

test("resolveUserName mapeia e faz fallback", () => {
  assert.equal(resolveUserName("abc", { abc: "José" }), "José");
  assert.equal(resolveUserName("xyz123456", {}), "Desconhecido (…123456)");
  assert.equal(resolveUserName("", {}), "Desconhecido");
});

test("fmtDuration formata pt-BR e trata nulo", () => {
  assert.equal(fmtDuration(8106), "8,1s");
  assert.equal(fmtDuration(null), "—");
});

test("applyFilters: modo, status e busca", () => {
  const recs = [
    { mode: "power", ok: true, prompt: "ligar TV", response: "ok", sessionKey: "j" },
    { mode: "fast", ok: false, prompt: "temperatura", response: null, error: "x", sessionKey: "j" },
  ];
  assert.equal(applyFilters(recs, { mode: "power" }).length, 1);
  assert.equal(applyFilters(recs, { status: "error" }).length, 1);
  assert.equal(applyFilters(recs, { query: "tv" }).length, 1);
});

test("computeStats agrega", () => {
  const recs = [
    { ok: true, durationMs: 1000, mode: "power", sessionKey: "j" },
    { ok: false, durationMs: 3000, mode: "fast", sessionKey: "j" },
  ];
  const s = computeStats(recs);
  assert.equal(s.total, 2);
  assert.equal(s.errors, 1);
  assert.equal(s.avgMs, 2000);
  assert.equal(s.maxMs, 3000);
  assert.equal(s.power, 1);
  assert.equal(s.fast, 1);
  assert.equal(s.topUser, "j");
});

test("groupByThread agrupa por sessionId", () => {
  const recs = [
    { sessionId: "A", ts: "1" }, { sessionId: "A", ts: "2" }, { sessionId: "B", ts: "3" },
  ];
  const g = groupByThread(recs);
  assert.equal(g.length, 2);
  assert.equal(g.find((x) => x.sessionId === "A").records.length, 2);
});
