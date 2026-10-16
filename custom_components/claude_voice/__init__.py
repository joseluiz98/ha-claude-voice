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
    # A versão vai no CAMINHO, não em query string. O módulo de entrada importa
    # ./format.js, ./styles.js, ./sheet.js e ./range-picker.js por caminho
    # relativo, e caminho relativo NÃO herda a query do importador: com
    # `?v=VERSION` só a entrada era cache-busted, e uma cópia velha de
    # format.js (mesma URL de sempre, servida sem Cache-Control, com frescor
    # heurístico pelo Last-Modified) quebrava a linkagem do módulo ES — painel
    # em branco, com erro só no console do navegador. Sob um segmento de
    # versão, os quatro imports herdam a URL nova de graça.
    # Continua embaixo de STATIC_URL de propósito: a Cache Rule de bypass do
    # Cloudflare cobre `/api/claude_voice/static/*` e precisa seguir cobrindo.
    versioned_url = f"{STATIC_URL}/{VERSION}"
    # cache_headers=True agora é seguro (e desejável): cada VERSION é uma URL
    # nova, então o conteúdo de cada URL é imutável por construção — acabou o
    # cenário "mesma URL, conteúdo diferente" que obrigava a servir sem
    # Cache-Control.
    await hass.http.async_register_static_paths(
        [StaticPathConfig(versioned_url, str(frontend_dir), True)]
    )

    async_register_ws(hass)

    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_WEBCOMPONENT,
        module_url=f"{versioned_url}/jarvis-logbook.js",
        sidebar_title="Jarvis Logbook",
        sidebar_icon="mdi:robot-happy",
        require_admin=True,
        config={"user_names": hass.data[DOMAIN]["user_names"]},
    )
    return True
