#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p daemon
for f in daemon.js warm-claude.js warm-helpers.js wrapper.sh set_voice_mode.sh; do
  cp "/share/claude-voice/$f" "daemon/$f"
done
rm -rf daemon/test && cp -r /share/claude-voice/test daemon/test
./make-examples.sh
echo "✅ daemon mirror atualizado."
