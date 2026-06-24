# ha-claude-voice

"Jarvis" — ponte de voz Alexa → Claude Code para Home Assistant + o painel **Jarvis Logbook**
(dashboard interativo do histórico de conversas por voz).

## O que é isso?

Este repositório contém dois componentes principais:

1. **Daemon de voz** (`daemon/`) — processo Node.js que recebe requests da Alexa via Custom Skill,
   mantém um processo `claude` quente e fala as respostas via `notify.alexa_media`.

2. **Custom Component `claude_voice`** (`custom_components/claude_voice/`) — integração Home Assistant
   que lê os arquivos NDJSON de histórico de conversas e expõe o painel **Jarvis Logbook** via
   WebSocket + frontend Lit.

## Arquitetura

```
Echo → Alexa Custom Skill → Node-RED /endpoint/alexa-skill
  → ACK < 8s (shouldEndSession)
  → POST async 172.30.32.1:8585/ask
  → daemon.js → processo claude quente (warm-claude.js)
  → resposta via notify.alexa_media_last_called
```

O histórico de conversas fica em `/share/claude-voice/conversations/YYYY-MM-DD.ndjson` e é lido
pelo custom component via WebSocket (`claude_voice/list_conversations`).

## Estrutura do repo

```
custom_components/claude_voice/   # Integração HA + painel Jarvis Logbook
  __init__.py                     # Setup, serviços, panel registration
  conversations.py                # Parser NDJSON + paginação
  ws_api.py                       # WebSocket commands (admin-only)
  frontend/
    jarvis-logbook.js             # LitElement — painel interativo
    format.js                     # Helpers de formatação (pure JS)
  tests/
    test_conversations.py         # Testes pytest do parser
    format.test.js                # Testes Jest dos helpers frontend

daemon/                           # Mirror do runtime (sem segredos)
  daemon.js                       # HTTP server 0.0.0.0:8585
  warm-claude.js                  # Processo claude persistente
  warm-helpers.js                 # Helpers do processo quente
  wrapper.sh                      # Supervisor com respawn + backoff
  set_voice_mode.sh               # Alterna modo fast/power
  config.example.json             # Template de configuração (sem token)
  mcp-voice.example.json          # Template MCP (sem token HA)
```

## Setup

### 1. Daemon de voz

```bash
# Copiar o daemon para o runtime dir
cp daemon/daemon.js /share/claude-voice/
cp daemon/warm-claude.js /share/claude-voice/
cp daemon/warm-helpers.js /share/claude-voice/
cp daemon/wrapper.sh /share/claude-voice/
cp daemon/set_voice_mode.sh /share/claude-voice/

# Criar config a partir do exemplo
cp daemon/config.example.json /share/claude-voice/config.json
# Editar: token, model, etc.
chmod 600 /share/claude-voice/config.json

# Criar mcp config
cp daemon/mcp-voice.example.json /share/claude-voice/mcp-voice.json
# Editar: Authorization header com token HA
chmod 600 /share/claude-voice/mcp-voice.json

# Iniciar via wrapper
bash /share/claude-voice/wrapper.sh &
```

### 2. Custom Component

```bash
# Copiar para custom_components do HA
cp -r custom_components/claude_voice /config/custom_components/

# Reiniciar HA
```

Adicionar ao `configuration.yaml`:
```yaml
claude_voice:
  conversation_dir: /share/claude-voice/conversations
```

## Scripts utilitários

```bash
# Sincronizar daemon runtime → repo (sem segredos)
./sync-daemon.sh

# Gerar apenas os arquivos .example
./make-examples.sh

# Varredura de segredos antes de commitar
./secret-sweep.sh
```

## Segredos — o que NÃO vai para o repo

Os seguintes arquivos contêm tokens e **nunca devem ser commitados** (estão no `.gitignore`):

- `daemon/config.json` — token Bearer do daemon + token do modelo
- `daemon/mcp-voice.json` — token do Home Assistant para o MCP
- `conversations/` — histórico de conversas (dados pessoais)
- `backups/` — backups dos flows Node-RED

Use `./secret-sweep.sh` antes de qualquer commit para garantir que nenhum segredo escapou.

## GitHub

https://github.com/joseluiz98/ha-claude-voice
