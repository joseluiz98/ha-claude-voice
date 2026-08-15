#!/usr/bin/env bash
# Responde QUEM É de verdade uma entidade: device físico, integração, área e
# qual entidade preferir quando o mesmo aparelho existe em duas integrações.
#
# Existe porque entity_id e friendly_name podem MENTIR: nomes antigos do app
# Tuya congelaram em entity_id e hoje apontam para outro aparelho real.
#   ha_whatis.sh switch.interruptor_cozinha_interruptor_1
#     -> Interruptor Quarto [tuya/NUVEM] <- FALLBACK, prefira switch.quarto
set -euo pipefail
exec python3 /data/claude-voice-workdir/ha_registry.py "$@"
