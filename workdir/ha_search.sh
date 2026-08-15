#!/usr/bin/env bash
# Descoberta de entidades do Home Assistant por palavra-chave (read-only).
# Filtra /states por termo(s) no entity_id OU friendly_name (AND entre termos)
# e ANOTA cada linha com o aparelho físico real, a integração e a área.
#
# A anotação NÃO é opcional: entity_id e friendly_name podem mentir. Em 15/08
# o CV apagou a luz do quarto porque switch.interruptor_cozinha_interruptor_1
# diz "cozinha" mas pertence ao Interruptor Quarto. Ver
# docs/superpowers/specs/2026-08-15-identidade-de-entidades-design.md
#
#   ha_search.sh <termo> [termo2 ...]
#     -> "entity_id | state | friendly_name | Device [plataforma] area=X <- PREFERIR"
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
    if (terms.every(t => (id + " " + fn).includes(t))) {
      out.push(e.entity_id + " | " + e.state + " | " + ((e.attributes && e.attributes.friendly_name) || ""));
    }
  }
  if (out.length === 0) { console.log("(nenhuma entidade casa: " + terms.join(" ") + ")"); return; }
  out.slice(0, 30).forEach(l => console.log(l));
  if (out.length > 30) console.log("... (" + out.length + " no total; refine os termos)");
});' \
  | python3 -c '
import sys
sys.path.insert(0, "/data/claude-voice-workdir")
import ha_registry

linhas = sys.stdin.read().splitlines()
# So paga o custo de indexar se houver resultado de verdade.
reais = [l for l in linhas if " | " in l]
index = ha_registry.build_index() if reais else None
for linha in linhas:
    if " | " not in linha:
        print(linha)
        continue
    eid = linha.split(" | ", 1)[0].strip()
    sufixo = ha_registry.format_suffix(ha_registry.resolve(index, eid))
    print(linha + (" | " + sufixo if sufixo else ""))
'
