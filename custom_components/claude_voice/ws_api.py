"""Comando WebSocket do Jarvis Logbook."""
from __future__ import annotations

import datetime as _dt

import voluptuous as vol

import homeassistant.util.dt as dt_util
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DEFAULT_CONV_DIR, DOMAIN
from .conversations import list_conversations, list_conversations_range


@callback
def async_register_ws(hass: HomeAssistant) -> None:
    """Registra o comando WS."""
    websocket_api.async_register_command(hass, ws_list_conversations)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "claude_voice/list_conversations",
        vol.Optional("date"): str,
        vol.Optional("from"): str,
        vol.Optional("to"): str,
    }
)
@websocket_api.async_response
async def ws_list_conversations(hass, connection, msg) -> None:
    """Devolve as conversas de um dia ou de um intervalo [from, to].

    Se `from` e `to` vierem, retorna o intervalo; senão usa `date` (default:
    hoje, TZ local).
    """
    store = hass.data.get(DOMAIN, {})
    base = store.get("conversations_dir") or DEFAULT_CONV_DIR
    if msg.get("from") and msg.get("to"):
        # Expande ±1 dia UTC: o cliente filtra pela data LOCAL, e um dia local
        # cruza dois arquivos UTC. O buffer garante cobertura das bordas.
        try:
            d_from = (_dt.date.fromisoformat(msg["from"]) - _dt.timedelta(days=1)).isoformat()
            d_to = (_dt.date.fromisoformat(msg["to"]) + _dt.timedelta(days=1)).isoformat()
        except ValueError:
            d_from, d_to = msg["from"], msg["to"]
        result = await hass.async_add_executor_job(
            list_conversations_range, base, d_from, d_to
        )
    else:
        date = msg.get("date") or dt_util.now().strftime("%Y-%m-%d")
        result = await hass.async_add_executor_job(list_conversations, base, date)
    connection.send_result(msg["id"], result)
