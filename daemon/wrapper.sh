#!/usr/bin/env bash
# Supervisor do claude-voice daemon.
# - Respawn automático em crash (com backoff anti crash-loop).
# - Restart sob demanda via flag file (/share/claude-voice/restart.flag),
#   que o HA (ou o button.claude_voice_restart) escreve — canal cross-container
#   pela pasta /share compartilhada.
# Lançado pelo init_commands do Advanced SSH addon (persistência no boot).
set -u

DIR=/share/claude-voice
DAEMON="$DIR/daemon.js"
FLAG="$DIR/restart.flag"
LOG="$DIR/wrapper.log"
NODE="$(command -v node || echo /usr/bin/node)"
PIDFILE="$DIR/wrapper.pid"

log() { echo "[$(date -u +%FT%TZ)] wrapper: $*" >> "$LOG"; }

# guard anti-duplicidade via pidfile + liveness (não casa com o harness/shells
# cuja linha de comando apenas contenha o caminho do script).
if [ -f "$PIDFILE" ]; then
  oldpid="$(cat "$PIDFILE" 2>/dev/null)"
  if [ -n "$oldpid" ] && [ "$oldpid" != "$$" ] && kill -0 "$oldpid" 2>/dev/null \
     && tr '\0' ' ' < "/proc/$oldpid/cmdline" 2>/dev/null | grep -qa "claude-voice/wrapper.sh"; then
    log "wrapper já roda (pid $oldpid); saindo"; exit 0
  fi
fi
echo "$$" > "$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT

# limpa daemons órfãos antes de assumir. O comm do node é "MainThread", então
# pgrep -x node não serve; varremos /proc casando a linha "/node .../daemon.js"
# (não casa com shells, que têm cmdline "/bin/bash -c ...").
for p in $(ls /proc 2>/dev/null | grep -E '^[0-9]+$'); do
  cl="$(tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null)"
  case "$cl" in *"/node /share/claude-voice/daemon.js"*) kill "$p" 2>/dev/null;; esac
done
rm -f "$FLAG"
log "iniciado (pid $$)"

backoff=3
while true; do
  rm -f "$FLAG"
  started=$(date +%s)
  log "subindo daemon"
  "$NODE" "$DAEMON" &
  PID=$!

  # monitora: flag de restart OU morte do processo
  while kill -0 "$PID" 2>/dev/null; do
    if [ -f "$FLAG" ]; then
      log "restart.flag detectado -> reiniciando daemon (pid $PID)"
      rm -f "$FLAG"
      kill "$PID" 2>/dev/null
      for _ in $(seq 1 10); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
      kill -9 "$PID" 2>/dev/null
      break
    fi
    sleep 2
  done

  wait "$PID" 2>/dev/null
  code=$?
  ran=$(( $(date +%s) - started ))

  # anti crash-loop: se viveu pouco, aumenta backoff (até 60s); senão reseta.
  if [ "$ran" -lt 10 ]; then
    backoff=$(( backoff * 2 )); [ "$backoff" -gt 60 ] && backoff=60
  else
    backoff=3
  fi
  log "daemon saiu (code=$code, viveu ${ran}s); respawn em ${backoff}s"
  sleep "$backoff"
done
