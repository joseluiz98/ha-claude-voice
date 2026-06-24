"""Comando WebSocket do Jarvis Logbook."""
from __future__ import annotations

import voluptuous as vol

import homeassistant.util.dt as dt_util
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN
from .conversations import list_conversations


@callback
def async_register_ws(hass: HomeAssistant) -> None:
    """Registra o comando WS."""
    websocket_api.async_register_command(hass, ws_list_conversations)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "claude_voice/list_conversations",
        vol.Optional("date"): str,
    }
)
@websocket_api.async_response
async def ws_list_conversations(hass, connection, msg) -> None:
    """Devolve as conversas de um dia (default: hoje, TZ local)."""
    store = hass.data.get(DOMAIN, {})
    base = store.get("conversations_dir")
    date = msg.get("date") or dt_util.now().strftime("%Y-%m-%d")
    result = await hass.async_add_executor_job(list_conversations, base, date)
    connection.send_result(msg["id"], result)
