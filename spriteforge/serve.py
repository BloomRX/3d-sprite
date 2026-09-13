#!/usr/bin/env python3
"""
SpriteForge Web — servidor local.

O app usa módulos ES + importmap, então NÃO funciona aberto por file://
(duplo clique no index.html): o navegador bloqueia o carregamento dos módulos
por CORS e nenhum botão responde. Este script sobe um servidor HTTP local,
descobre uma porta livre e abre o navegador sozinho.

Uso:
    py -3 spriteforge/serve.py               (Windows)
    python3 spriteforge/serve.py             (Linux/macOS)
    python3 spriteforge/serve.py --porta 9000 --sem-navegador
"""
from __future__ import annotations

import argparse
import http.server
import os
import socket
import sys
import threading
import webbrowser
from functools import partial

APP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app")
INDEX = os.path.join(APP_DIR, "index.html")

# http.server já conhece .js/.json; garantimos os tipos de 3D e de módulo ES
# mesmo em Pythons mais antigos.
EXTRA_TYPES = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".json": "application/json",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".bin": "application/octet-stream",
    ".png": "image/png",
    ".wasm": "application/wasm",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **EXTRA_TYPES}

    def end_headers(self) -> None:
        # Deixa o app carregável dentro de iframe/preview e nunca em cache obsoleto.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:  # silêncio no console do usuário
        pass


def porta_livre(inicio: int, tentativas: int = 30, host: str = "127.0.0.1") -> int:
    """Devolve a primeira porta desocupada a partir de `inicio`."""
    for porta in range(inicio, inicio + tentativas):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind((host, porta))
            except OSError:
                continue
            return porta
    raise SystemExit(
        f"Nenhuma porta livre entre {inicio} e {inicio + tentativas - 1}. "
        "Feche outros servidores ou passe --porta."
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Sobe o SpriteForge Web em HTTP local.")
    parser.add_argument("--porta", type=int, default=8080, help="porta inicial (padrão 8080)")
    parser.add_argument("--host", default="127.0.0.1", help="interface (padrão 127.0.0.1; use 0.0.0.0 para acessar da rede)")
    parser.add_argument("--sem-navegador", action="store_true", help="não abre o navegador")
    args = parser.parse_args()

    if not os.path.isfile(INDEX):
        print(f"ERRO: não achei {INDEX}", file=sys.stderr)
        print("Este script precisa ficar ao lado da pasta app/ (spriteforge/serve.py).", file=sys.stderr)
        return 1

    porta = porta_livre(args.porta, host=args.host)
    url = f"http://{'localhost' if args.host in ('127.0.0.1', '0.0.0.0') else args.host}:{porta}/"

    servidor = http.server.ThreadingHTTPServer((args.host, porta), partial(Handler, directory=APP_DIR))
    print("=" * 62, flush=True)
    print("  SpriteForge Web")
    print(f"  servindo : {APP_DIR}")
    print(f"  url      : {url}")
    print("  pare com : Ctrl+C")
    print("=" * 62, flush=True)

    if not args.sem_navegador:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nencerrado.", flush=True)
    finally:
        servidor.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
