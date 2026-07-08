export function resolveUserName(sessionKey, userNames = {}) {
  if (!sessionKey) return "Desconhecido";
  if (userNames && userNames[sessionKey]) return userNames[sessionKey];
  return "Desconhecido (…" + String(sessionKey).slice(-6) + ")";
}

export function fmtDuration(ms) {
  if (ms == null || isNaN(ms)) return "—";
  return (Number(ms) / 1000).toFixed(1).replace(".", ",") + "s";
}

export function fmtTime(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDate(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// Data LOCAL (fuso do navegador) como "YYYY-MM-DD", comparável lexicograficamente.
// Usada para filtrar por range de data local, já que o ts é UTC mas a exibição é local.
export function localISODate(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function applyFilters(records, f = {}) {
  return records.filter((r) => {
    if (f.user && r.sessionKey !== f.user) return false;
    if (f.mode && r.mode !== f.mode) return false;
    if (f.status === "ok" && !r.ok) return false;
    if (f.status === "error" && r.ok) return false;
    if (f.query) {
      const q = f.query.toLowerCase();
      const hay = ((r.prompt || "") + " " + (r.response || "")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function computeStats(records) {
  let errors = 0, sum = 0, max = 0, power = 0, fast = 0;
  const byUser = {};
  for (const r of records) {
    if (!r.ok) errors++;
    const d = Number(r.durationMs) || 0;
    sum += d;
    if (d > max) max = d;
    if (r.mode === "power") power++;
    else if (r.mode === "fast") fast++;
    if (r.sessionKey) byUser[r.sessionKey] = (byUser[r.sessionKey] || 0) + 1;
  }
  const total = records.length;
  const topUser = Object.keys(byUser).sort((a, b) => byUser[b] - byUser[a])[0] || null;
  return { total, errors, avgMs: total ? Math.round(sum / total) : 0, maxMs: max, power, fast, topUser };
}

export function groupByThread(records) {
  const map = new Map();
  for (const r of records) {
    const k = r.sessionId || "_" + (r.ts || "");
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return Array.from(map.entries()).map(([sessionId, recs]) => ({ sessionId, records: recs }));
}

export function presetRange(key, now = new Date()) {
  const iso = (d) => localISODate(d);
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const minus = (n) => { const d = new Date(d0); d.setDate(d.getDate() - n); return d; };
  switch (key) {
    case "today": return { from: iso(d0), to: iso(d0) };
    case "yesterday": return { from: iso(minus(1)), to: iso(minus(1)) };
    case "week": { const wd = (d0.getDay() + 6) % 7; return { from: iso(minus(wd)), to: iso(d0) }; }
    case "month": return { from: iso(new Date(d0.getFullYear(), d0.getMonth(), 1)), to: iso(d0) };
    case "last7": return { from: iso(minus(6)), to: iso(d0) };
    case "last30": return { from: iso(minus(29)), to: iso(d0) };
    default: return { from: iso(d0), to: iso(d0) };
  }
}

// Matriz de semanas (seg→dom) cobrindo o mês; células podem ser do mês vizinho.
export function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // seg=0
  const start = new Date(year, month, 1 - startOffset);
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      row.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d));
    }
    weeks.push(row);
  }
  // remove última semana se toda fora do mês
  if (weeks[5].every((d) => d.getMonth() !== month)) weeks.pop();
  return weeks;
}
