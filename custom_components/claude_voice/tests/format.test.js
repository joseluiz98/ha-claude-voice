import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveUserName, fmtDuration, localISODate, applyFilters, computeStats, groupByThread,
  presetRange, monthMatrix,
} from "../frontend/format.js";

test("localISODate retorna YYYY-MM-DD local e trata inválido", () => {
  // meio-dia UTC: a data local coincide com a UTC em qualquer fuso realista
  assert.equal(localISODate("2026-06-24T12:00:00Z"), "2026-06-24");
  assert.equal(localISODate("lixo"), "");
});

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

test("presetRange: hoje e últimos 7 dias", () => {
  const now = new Date(2026, 6, 8, 12, 0, 0); // 2026-07-08 local
  assert.deepEqual(presetRange("today", now), { from: "2026-07-08", to: "2026-07-08" });
  assert.deepEqual(presetRange("last7", now), { from: "2026-07-02", to: "2026-07-08" });
});

test("monthMatrix: julho/2026 começa numa terça (seg-based)", () => {
  const m = monthMatrix(2026, 6); // month 0-based → julho
  assert.equal(m[0].length, 7);
  // 1 de julho/2026 é quarta; célula 0 = segunda anterior (29/jun)
  assert.equal(m[0][0].getDate(), 29);
  assert.equal(m[0][2].getDate(), 1);
});
