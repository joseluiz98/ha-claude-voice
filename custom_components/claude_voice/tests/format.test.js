import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveUserName, fmtDuration, localISODate, applyFilters, computeStats, groupByThread,
  presetRange, monthMatrix, shouldShowMenu, pickerLayout, PICKER_BREAKPOINTS,
  detailLayout, MOBILE_QUERY, stepSelection, ignoresArrowKeys, escTarget, popoverPosition,
  stickyScrollMargin, keyTargetsPanel,
} from "../frontend/format.js";

test("localISODate retorna YYYY-MM-DD local e trata inválido", () => {
  // meio-dia UTC: a data local coincide com a UTC em qualquer fuso realista
  assert.equal(localISODate("2026-06-24T12:00:00Z"), "2026-06-24");
  assert.equal(localISODate("lixo"), "");
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

test("regime celular por largura OU altura (spec §4.1)", () => {
  assert.equal(MOBILE_QUERY, "(max-width: 760px), (max-height: 500px)");
  assert.equal(detailLayout({ width: 760, height: 900 }), "sheet");
  assert.equal(detailLayout({ width: 761, height: 900 }), "drawer");
  assert.equal(detailLayout({ width: 852, height: 393 }), "sheet");   // iPhone deitado
  assert.equal(detailLayout({ width: 1280, height: 500 }), "sheet");
  assert.equal(detailLayout({ width: 1280, height: 501 }), "drawer");
});

test("o seletor de datas continua com os limiares próprios (faixa 761–870)", () => {
  assert.equal(detailLayout({ width: 800, height: 900 }), "drawer");
  assert.equal(pickerLayout({ width: 800, height: 900 }).container, "sheet");
});

test("resolveUserName: mapa, F.R.I.D.A.Y., automações do CV e desconhecidos (spec §4.5)", () => {
  const um = { "amzn1.ask.account.XYZ": "José", "friday-satelite-sat-8295e1": "Friday · satélite Escritório" };
  assert.equal(resolveUserName("amzn1.ask.account.XYZ", um), "José");
  assert.equal(resolveUserName("friday-satelite-sat-8295e1", um), "Friday · satélite Escritório");
  assert.equal(resolveUserName("friday-pagina", um), "Friday · página");
  assert.equal(resolveUserName("friday-satelite-sat-desconhecido", um), "Friday · satélite sat-desconhecido");
  assert.equal(resolveUserName("homelab-operator", um), "CV · homelab-operator");
  assert.equal(resolveUserName("manual-refire-17837767", um), "CV · manual-refire-17837767");
  assert.equal(resolveUserName("amzn1.ask.account.OUTRA123456", um), "Desconhecido (…123456)");
  assert.equal(resolveUserName("", um), "Desconhecido");
  assert.equal(resolveUserName(undefined, um), "Desconhecido");
});

test("stepSelection usa a identidade e não o índice", () => {
  const a = { id: "a" }, b = { id: "b" }, c = { id: "c" };
  assert.equal(stepSelection([a, b, c], b, 1), c);
  assert.equal(stepSelection([a, b, c], b, -1), a);
  assert.equal(stepSelection([a, b, c], c, 1), null);   // não passa do último
  assert.equal(stepSelection([a, b, c], a, -1), null);  // nem do primeiro
  assert.equal(stepSelection([c, b, a], b, 1), a);      // lista redesenhada: segue a ordem nova
});

test("stepSelection fora da lista: ↓ vai ao primeiro, ↑ ao último", () => {
  const a = { id: "a" }, b = { id: "b" }, sumiu = { id: "x" };
  assert.equal(stepSelection([a, b], sumiu, 1), a);
  assert.equal(stepSelection([a, b], sumiu, -1), b);
  assert.equal(stepSelection([], sumiu, 1), null);
});

test("ignoresArrowKeys: campos de texto e selects ficam com as setas", () => {
  for (const t of ["INPUT", "SELECT", "TEXTAREA", "input"]) assert.equal(ignoresArrowKeys(t), true, t);
  for (const t of ["BODY", "TR", "BUTTON", "DIALOG", ""]) assert.equal(ignoresArrowKeys(t), false, t);
});

test("esc fecha o que abriu por último (seletor antes da gaveta)", () => {
  assert.equal(escTarget({ pickerOpen: true, drawerOpen: true }), "picker");
  assert.equal(escTarget({ pickerOpen: false, drawerOpen: true }), "drawer");
  assert.equal(escTarget({ pickerOpen: true, drawerOpen: false }), "picker");
  assert.equal(escTarget({ pickerOpen: false, drawerOpen: false }), null);
});

test("popoverPosition ancora abaixo do campo e não sai da janela", () => {
  const vp = { width: 1280, height: 800 }, pop = { width: 560, height: 360 };
  assert.deepEqual(popoverPosition({ field: { left: 100, bottom: 120 }, pop, viewport: vp }), { top: 126, left: 100 });
  assert.deepEqual(popoverPosition({ field: { left: 900, bottom: 120 }, pop, viewport: vp }), { top: 126, left: 712 }); // 1280 − 560 − 8
  assert.deepEqual(popoverPosition({ field: { left: -20, bottom: 120 }, pop, viewport: vp }), { top: 126, left: 8 });
});

test("ignoresArrowKeys: checkbox/radio/botão não seguram as setas (só campos de texto)", () => {
  for (const ty of ["checkbox", "radio", "button"]) assert.equal(ignoresArrowKeys("INPUT", ty), false, ty);
  for (const ty of ["text", "search", "", undefined]) assert.equal(ignoresArrowKeys("INPUT", ty), true, String(ty));
  assert.equal(ignoresArrowKeys("SELECT", "select-one"), true);
});

test("stickyScrollMargin: no desktop a linha não pode ficar sob o header/toolbar fixos", () => {
  assert.equal(stickyScrollMargin({ drawer: true, toolbarBottom: 187.4 }), 188);
  assert.equal(stickyScrollMargin({ drawer: true, toolbarBottom: -5 }), 0);
  assert.equal(stickyScrollMargin({ drawer: false, toolbarBottom: 187 }), 0); // celular: header não é fixo
});

test("keyTargetsPanel: teclas de diálogos do HA ou da sidebar não são do painel", () => {
  const painel = { tagName: "JARVIS-LOGBOOK" };
  assert.equal(keyTargetsPanel([{ tagName: "TR" }, { tagName: "TABLE" }, painel, { tagName: "BODY" }], painel), true);
  assert.equal(keyTargetsPanel([{ tagName: "BODY" }, { tagName: "HTML" }], painel), true);   // foco solto no documento
  assert.equal(keyTargetsPanel([{ tagName: "HA-DIALOG" }, { tagName: "BODY" }], painel), false);
  assert.equal(keyTargetsPanel([{ tagName: "HA-MD-LIST-ITEM" }, { tagName: "HA-SIDEBAR" }], painel), false);
  assert.equal(keyTargetsPanel([], painel), false);
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
