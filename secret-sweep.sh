#!/usr/bin/env bash
# Falha (exit 1) se achar segredo no working tree (exceto .git e arquivos .example).
set -euo pipefail
cd "$(dirname "$0")"
PATTERN='Bearer [A-Za-z0-9._-]{20,}|amzn1\.ask\.account\.[A-Z0-9]{40,}|eyJ[A-Za-z0-9._-]{20,}|"token"[[:space:]]*:[[:space:]]*"[^"]{16,}"'
HITS=$(grep -REn --exclude-dir=.git --include='*.js' --include='*.json' --include='*.py' --include='*.sh' --include='*.md' --include='*.yaml' -E "$PATTERN" . | grep -v '\.example\.' || true)
if [ -n "$HITS" ]; then
  echo "❌ Possível segredo encontrado:"; echo "$HITS"; exit 1
fi
echo "✅ Sweep limpo."
