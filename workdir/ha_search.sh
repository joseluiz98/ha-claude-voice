#!/usr/bin/env bash
# Descoberta de entidades do Home Assistant por palavra-chave (read-only).
# Faz GET /states e filtra por termo(s) no entity_id OU friendly_name (AND entre termos).
# Pre-aprovado no allowlist do daemon de voz: ferramenta de DESCOBERTA para o agente
# achar sozinho o entity_id que precisa (ex: "seleção", "jogo cs2", "ar quarto").
#
#   ha_search.sh <termo> [termo2 ...]   -> "entity_id | state | friendly_name" (ate 30)
set -euo pipefail

TOKEN="${SUPERVISOR_TOKEN:-${HASSIO_TOKEN:-}}"
[ -z "$TOKEN" ] && { echo "erro: sem SUPERVISOR_TOKEN" >&2; exit 3; }
[ "$#" -eq 0 ] && { echo "uso: ha_search.sh <termo> [termo ...]" >&2; exit 2; }

curl -sf "http://supervisor/core/api/states" -H "Authorization: Bearer ${TOKEN}" \
  | TERMS="$*" node -e '
const terms = (process.env.TERMS || "").toLowerCase().split(/\s+/).filter(Boolean);
let d = "";
process.stdin.on("data", c => d += c).on("end", () => {
  let a; try { a = JSON.parse(d); } catch (_) { console.log("(erro lendo estados)"); return; }
  const out = [];
  for (const e of a) {
    const id = e.entity_id.toLowerCase();
    const fn = ((e.attributes && e.attributes.friendly_name) || "").toLowerCase();
    const hay = id + " " + fn;
    if (terms.every(t => hay.includes(t))) {
      out.push(e.entity_id + " | " + e.state + " | " + ((e.attributes && e.attributes.friendly_name) || ""));
    }
  }
  if (out.length === 0) { console.log("(nenhuma entidade casa: " + terms.join(" ") + ")"); return; }
  out.slice(0, 30).forEach(l => console.log(l));
  if (out.length > 30) console.log("... (" + out.length + " no total; refine os termos)");
});'
