#!/usr/bin/env bash
# Alterna o daemon de voz entre "fast" (latencia minima) e "power" (potencia do LLM).
# REVERSIVEL: rode com o outro modo. Mantem o auto-classifier (seguranca) em AMBOS.
# Os 8s da Alexa nunca sao tocados (modelo assincrono); aqui so se ajusta SLA/potencia.
#
#   set_voice_mode.sh fast | power
#
# Levers (incremento 1): model, fallbackModel, turnTimeoutMs, resetMaxTurns,
# resetMaxAgeMs e o bloco de persona (economia x exploracao). Token preservado.
set -euo pipefail

MODE="${1:-}"
case "$MODE" in
  fast|power) ;;
  *) echo "uso: set_voice_mode.sh fast|power" >&2; exit 2;;
esac

node -e '
const fs=require("fs");
const p="/share/claude-voice/config.json";
const mode=process.argv[1];
const c=JSON.parse(fs.readFileSync(p,"utf8"));

const profiles={
  fast:{
    turnTimeoutMs:90000, resetMaxTurns:12, resetMaxAgeMs:7200000,
    suffix:"\n- MODO RAPIDO: priorize velocidade; se nao resolver em poucas tentativas, diga em uma frase que nao conseguiu."
  },
  power:{
    turnTimeoutMs:240000, resetMaxTurns:24, resetMaxAgeMs:14400000,
    suffix:"\n- MODO POTENCIA: pode pensar mais e usar mais ferramentas para CHEGAR na resposta (descubra com ha_search/GetLiveContext/WebSearch, combine ferramentas e verifique; sem pressa de latencia, o usuario recebe a resposta por anuncio). So desista se realmente nao houver caminho. A resposta FALADA continua curta, 1-2 frases."
  }
};

const pr=profiles[mode];
c.turnTimeoutMs=pr.turnTimeoutMs;
c.resetMaxTurns=pr.resetMaxTurns;
c.resetMaxAgeMs=pr.resetMaxAgeMs;
c.mode=mode;

// Gerencia o bloco de modo no FIM da persona: remove o antigo, anexa o novo.
const MARK="\n- MODO ";
let base=c.voiceSystemPrompt;
const i=base.indexOf(MARK);
if(i>=0) base=base.slice(0,i);
c.voiceSystemPrompt=base+pr.suffix;

fs.writeFileSync(p, JSON.stringify(c,null,2)+"\n");
console.log("modo="+mode+" | model="+c.model+" | turnTimeoutMs="+c.turnTimeoutMs+" | resetMaxTurns="+c.resetMaxTurns+" | resetMaxAgeMs="+c.resetMaxAgeMs);
' "$MODE"

touch /share/claude-voice/restart.flag
echo "restart.flag tocado -> daemon vai reiniciar no modo ${MODE}"
