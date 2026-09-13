#!/usr/bin/env sh
# SpriteForge Web — sobe o servidor local e abre o navegador.
# (index.html por duplo clique não funciona: módulos ES são bloqueados em file://)
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then exec python3 spriteforge/serve.py "$@"; fi
if command -v python  >/dev/null 2>&1; then exec python  spriteforge/serve.py "$@"; fi
echo "ERRO: Python 3.8+ nao encontrado." >&2
exit 1
