#!/usr/bin/env sh
# SpriteForge Web — sobe o servidor local e abre o navegador.
# (index.html por duplo clique não funciona: módulos ES são bloqueados em file://)
cd "$(dirname "$0")" || exit 1
# Janela própria por padrão (sem abas nem barra de endereço); --navegador abre numa aba.
MODO="--app"
if [ "$1" = "--navegador" ]; then MODO=""; shift; fi
# shellcheck disable=SC2086  (MODO vazio de propósito no modo navegador)
if command -v python3 >/dev/null 2>&1; then exec python3 spriteforge/serve.py $MODO "$@"; fi
# shellcheck disable=SC2086
if command -v python  >/dev/null 2>&1; then exec python  spriteforge/serve.py $MODO "$@"; fi
echo "ERRO: Python 3.8+ nao encontrado." >&2
exit 1
