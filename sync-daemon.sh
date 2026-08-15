#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p daemon
for f in daemon.js warm-claude.js warm-helpers.js wrapper.sh set_voice_mode.sh; do
  cp "/share/claude-voice/$f" "daemon/$f"
done
WORKDIR_SRC="${WORKDIR_SRC:-/data/claude-voice-workdir}"
mkdir -p workdir
for f in ha_read.sh ha_search.sh ha_whatis.sh ha_registry.py test_ha_registry.py; do
  [ -f "$WORKDIR_SRC/$f" ] && cp "$WORKDIR_SRC/$f" "workdir/$f"
done
rm -rf daemon/test && cp -r /share/claude-voice/test daemon/test
./make-examples.sh
echo "✅ daemon mirror atualizado."
