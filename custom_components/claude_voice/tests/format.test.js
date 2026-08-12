import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveUserName, fmtDuration, localISODate, applyFilters, computeStats, groupByThread,
  presetRange, monthMatrix, shouldShowMenu, pickerLayout, PICKER_BREAKPOINTS,
  detailLayout, DETAIL_SHEET_MAX_WIDTH,
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

test("monthMatrix: fevereiro/2021 cabe em 4 linhas (sem semana extra fora do mês)", () => {
  const m = monthMatrix(2021, 1); // fevereiro (0-based)
  assert.equal(m.length, 4);
  assert.equal(m[0][0].getDate(), 1);   // 1/fev/2021 é segunda
  assert.equal(m[3][6].getDate(), 28);  // termina em 28/fev (domingo)
});

test("shouldShowMenu: mesma condição do ha-panel-app do HA", () => {
  // no celular a sidebar é retrátil — o botão é a única saída
  assert.equal(shouldShowMenu({ narrow: true, dockedSidebar: "auto" }), true);
  // desktop com sidebar fixa: o botão seria redundante
  assert.equal(shouldShowMenu({ narrow: false, dockedSidebar: "docked" }), false);
  assert.equal(shouldShowMenu({ narrow: false, dockedSidebar: "auto" }), false);
  // quem escolheu "ocultar sempre" no perfil precisa do botão em qualquer largura
  assert.equal(shouldShowMenu({ narrow: false, dockedSidebar: "always_hidden" }), true);
  // o HA pode ainda não ter setado as props
  assert.equal(shouldShowMenu({ narrow: undefined, dockedSidebar: undefined }), false);
});

// I3: o detalhe é folha só onde o CSS o desenha como folha — @media
// (max-width:760px). Usar os limiares do picker (870/500) aqui era o que fazia
// abrir o seletor de datas fechar a coluna de detalhe na faixa 761–870px e em
// qualquer largura com janela baixa (DevTools ancorado embaixo).
test("detailLayout segue o @media do CSS, e NÃO os limiares do picker", () => {
  assert.equal(detailLayout({ width: DETAIL_SHEET_MAX_WIDTH }), "sheet");
  assert.equal(detailLayout({ width: DETAIL_SHEET_MAX_WIDTH + 1 }), "column");
  // a faixa de sobreposição: picker vira folha, detalhe continua coluna
  assert.equal(pickerLayout({ width: 800, height: 900 }).container, "sheet");
  assert.equal(detailLayout({ width: 800 }), "column");
  // altura não entra na conta do detalhe — o CSS do .detail não tem max-height
  assert.equal(detailLayout({ width: 1280, height: 300 }), "column");
});

test("pickerLayout: fronteiras dos dois breakpoints do HA", () => {
  const l = (width, height) => pickerLayout({ width, height });
  // desktop
  assert.deepEqual(l(1280, 800), { container: "popover", presets: "list" });
  // fronteira do container: 870 é folha, 871 ainda é popover
  assert.deepEqual(l(871, 800), { container: "popover", presets: "list" });
  assert.deepEqual(l(870, 800), { container: "sheet", presets: "list" });
  // fronteira dos presets: 450 vira chips, 451 ainda é lista
  assert.deepEqual(l(451, 800), { container: "sheet", presets: "list" });
  assert.deepEqual(l(450, 800), { container: "sheet", presets: "chips" });
});

test("pickerLayout: altura baixa decide sozinha (celular deitado)", () => {
  // 852px de largura sozinha daria popover/list; é o max-height:500 que decide.
  // Sem este caso, o breakpoint de altura pode ser removido por engano.
  assert.deepEqual(pickerLayout({ width: 852, height: 393 }), { container: "sheet", presets: "chips" });
  assert.deepEqual(pickerLayout({ width: 393, height: 852 }), { container: "sheet", presets: "chips" });
});

// Guarda de regressão (I2, revisão da Task 7): range-picker.js monta seu
// matchMedia a partir de PICKER_BREAKPOINTS, não de literais copiados. Este
// teste usa a MESMA constante para achar a borda — se o limiar mudar, o teste
// migra junto e continua provando que pickerLayout() decide exatamente nela.
// Um teste com números fixos (870/450/500) não pegaria o listener parando de
// reagir na nova fronteira depois de uma mudança na constante.
test("PICKER_BREAKPOINTS é a única fonte dos limiares: pickerLayout decide na borda exata da constante", () => {
  const { sheetWidth, sheetHeight, chipsWidth } = PICKER_BREAKPOINTS;
  assert.equal(pickerLayout({ width: sheetWidth, height: 800 }).container, "sheet");
  assert.equal(pickerLayout({ width: sheetWidth + 1, height: 800 }).container, "popover");
  assert.equal(pickerLayout({ width: chipsWidth, height: 800 }).presets, "chips");
  assert.equal(pickerLayout({ width: chipsWidth + 1, height: 800 }).presets, "list");
  assert.equal(pickerLayout({ width: 900, height: sheetHeight }).container, "sheet");
  assert.equal(pickerLayout({ width: 900, height: sheetHeight + 1 }).container, "popover");
});
