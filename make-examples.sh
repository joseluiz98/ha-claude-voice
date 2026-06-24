#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python3 - <<'PY'
import json
c = json.load(open('/share/claude-voice/config.json'))
c['token'] = '<YOUR_DAEMON_BEARER_TOKEN>'
json.dump(c, open('daemon/config.example.json', 'w'), indent=2, ensure_ascii=False)

m = json.load(open('/share/claude-voice/mcp-voice.json'))
def red(o):
    if isinstance(o, dict):
        return {k: ('Bearer <YOUR_HA_TOKEN>' if k.lower() == 'authorization' else red(v)) for k, v in o.items()}
    if isinstance(o, list):
        return [red(x) for x in o]
    return o
json.dump(red(m), open('daemon/mcp-voice.example.json', 'w'), indent=2, ensure_ascii=False)
print('examples gerados')
PY
