#!/bin/sh
# Fixture de teste: ignora todos os argumentos e fica vivo até ser morto.
# Precisa ficar vivo — se sair, WarmClaude._onClose agenda respawn e o teste
# termina com timer pendente.
exec sleep 30
