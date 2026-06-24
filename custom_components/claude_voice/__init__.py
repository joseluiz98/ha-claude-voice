"""Claude Voice (Jarvis) — painel de logbook de conversas por voz."""
from __future__ import annotations

from pathlib import Path

import voluptuous as vol

import homeassistant.helpers.config_validation as cv
from homeassistant.components import panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from .const import (
    DEFAULT_CONV_DIR,
    DOMAIN,
    PANEL_URL_PATH,
    PANEL_WEBCOMPONENT,
    STATIC_URL,
    VERSION,
)
from .ws_api import async_register_ws

CONFIG_SCHEMA = vol.Schema(
    {
        DOMAIN: vol.Schema(
            {
                vol.Optional("conversations_dir", default=DEFAULT_CONV_DIR): cv.string,
                vol.Optional("user_names", default={}): {cv.string: cv.string},
            }
        )
    },
    extra=vol.ALLOW_EXTRA,
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the Jarvis Logbook panel."""
    conf = config.get(DOMAIN) or {}
    hass.data[DOMAIN] = {
        "conversations_dir": conf.get("conversations_dir", DEFAULT_CONV_DIR),
        "user_names": conf.get("user_names", {}),
    }

    frontend_dir = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL, str(frontend_dir), False)]
    )

    async_register_ws(hass)

    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_WEBCOMPONENT,
        module_url=f"{STATIC_URL}/jarvis-logbook.js?v={VERSION}",
        sidebar_title="Jarvis Logbook",
        sidebar_icon="mdi:robot-happy",
        require_admin=True,
        config={"user_names": hass.data[DOMAIN]["user_names"]},
    )
    return True
