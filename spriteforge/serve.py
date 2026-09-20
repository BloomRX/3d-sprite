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
import shutil
import socket
import subprocess
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


# Candidatos a "janela de app": navegadores Chromium abrem uma janela sem abas,
# sem barra de endereço e sem extensões com --app=URL. É o mesmo motor que já
# renderiza o SpriteForge, então nada muda no app em si — e não entra nenhum
# executável novo no repositório.
CAMINHOS_APP = {
    "win": [
        r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe",
        r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe",
        r"%LocalAppData%\Microsoft\Edge\Application\msedge.exe",
        r"%ProgramFiles%\Google\Chrome\Application\chrome.exe",
        r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe",
        r"%LocalAppData%\Google\Chrome\Application\chrome.exe",
    ],
    "outro": [
        "microsoft-edge", "microsoft-edge-stable", "google-chrome",
        "google-chrome-stable", "chromium", "chromium-browser",
    ],
}


def achar_navegador_app(sistema: str = sys.platform, caminho_extra: str | None = None,
                        existe=os.path.isfile, na_path=shutil.which,
                        expandir=os.path.expandvars) -> str | None:
    """Devolve o executável de um navegador Chromium, ou None.

    `sistema` é `sys.platform`; `win*` usa os caminhos de instalação padrão do
    Windows (com as variáveis de ambiente expandidas), o resto procura no PATH.
    `expandir` é injetável porque `os.path.expandvars` não entende `%VAR%` fora
    do Windows — sem isso a expansão não seria testável em Linux/macOS.
    """
    if caminho_extra:
        expandido = expandir(caminho_extra)
        if existe(expandido) or na_path(expandido):
            return expandido
    candidatos = CAMINHOS_APP["win"] if sistema.startswith("win") else CAMINHOS_APP["outro"]
    for candidato in candidatos:
        expandido = expandir(candidato)
        if existe(expandido):
            return expandido
        achado = na_path(expandido)
        if achado:
            return achado
    return None


def montar_comando_app(exe: str, url: str, perfil: str, largura: int = 1500,
                       altura: int = 950) -> list[str]:
    """Linha de comando da janela de app.

    `--user-data-dir` próprio é o que faz o `--app` abrir uma janela separada:
    sem ele, se o navegador já estiver aberto, o Chromium ignora a flag e joga
    o app numa aba do perfil em uso.
    """
    return [
        exe,
        f"--app={url}",
        f"--user-data-dir={perfil}",
        f"--window-size={largura},{altura}",
        "--new-window",
        "--no-first-run",
        "--no-default-browser-check",
    ]


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
    parser.add_argument("--app", action="store_true",
                        help="abre em janela própria (sem abas nem barra de endereço) usando Edge/Chrome")
    parser.add_argument("--perfil", default=None,
                        help="pasta do perfil da janela de app (padrão: .perfil-app/ ao lado do servidor)")
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

    if args.app:
        perfil = args.perfil or os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, ".perfil-app")
        exe = achar_navegador_app()
        if exe:
            os.makedirs(perfil, exist_ok=True)
            comando = montar_comando_app(exe, url, os.path.abspath(perfil))
            print(f"  janela   : modo app via {os.path.basename(exe)}", flush=True)
            # Popen sem wait: a janela vive por conta própria, o servidor continua aqui.
            subprocess.Popen(comando, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            print("  janela   : Edge/Chrome não achados — abrindo no navegador padrão", flush=True)
            threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    elif not args.sem_navegador:
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
