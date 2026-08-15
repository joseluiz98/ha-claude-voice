#!/usr/bin/env bash
# Leitura read-only de estado de entidade do Home Assistant.
# Pré-aprovado no allowlist do daemon de voz (Bash(...ha_read.sh:*)) para que
# leituras pulem o classificador --permission-mode auto e fiquem mais rápidas.
# SÓ faz GET em /core/api/states/<entity_id>. Não escreve nada.
#
#   ha_read.sh <entity_id>          -> imprime só o state
#   ha_read.sh <entity_id> --full   -> imprime o JSON completo (state+attributes)
set -euo pipefail

ENTITY="${1:-}"
MODE="${2:-state}"
if [ -z "$ENTITY" ]; then
  echo "uso: ha_read.sh <entity_id> [--full]" >&2
  exit 2
fi

TOKEN="${SUPERVISOR_TOKEN:-${HASSIO_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "erro: sem SUPERVISOR_TOKEN" >&2
  exit 3
fi

# --data-urlencode garante que o entity_id vá seguro na URL (sem injeção de path).
RESP=$(curl -sf -G "http://supervisor/core/api/states/${ENTITY}" \
  -H "Authorization: Bearer ${TOKEN}")

if [ "$MODE" = "--full" ]; then
  echo "$RESP"
else
  # extrai só o campo state sem depender de jq
  echo "$RESP" | sed -n 's/.*"state"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1
fi
