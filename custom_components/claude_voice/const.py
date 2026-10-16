"""Constantes do component claude_voice (Jarvis Logbook)."""
DOMAIN = "claude_voice"
# Bumpar a cada mudança no frontend: a VERSION é um SEGMENTO do caminho estático
# (STATIC_URL/VERSION/...), então bumpar troca a URL de TODOS os módulos de uma vez
# — inclusive a dos imports relativos, que uma query ?v= nunca alcançava.
VERSION = "0.8.2"
DEFAULT_CONV_DIR = "/share/claude-voice/conversations"
PANEL_URL_PATH = "jarvis-logbook"
PANEL_WEBCOMPONENT = "jarvis-logbook"
STATIC_URL = "/api/claude_voice/static"
