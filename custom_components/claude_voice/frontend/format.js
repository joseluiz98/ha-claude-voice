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
    if (f.timeFrom || f.timeTo) {
      const hhmm = fmtTime(r.ts);
      if (f.timeFrom && hhmm < f.timeFrom) return false;
      if (f.timeTo && hhmm > f.timeTo) return false;
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
