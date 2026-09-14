#!/usr/bin/env python3
"""
Testes de spriteforge/serve.py — só as partes puras (descoberta do navegador de
modo app e montagem da linha de comando). Nenhum teste sobe servidor nem abre
janela: nada aqui precisa de rede, GPU ou desktop.

    py -3 -m unittest discover -s tools -p "test_*.py"
"""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "spriteforge"))

import serve  # noqa: E402  (import depois do sys.path, de propósito)


class AcharNavegadorTests(unittest.TestCase):
    """A busca não pode depender do que está instalado na máquina do teste."""

    def test_windows_acha_edge_pelo_caminho_de_instalacao(self):
        instalados = {r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"}
        achado = serve.achar_navegador_app(
            sistema="win32", existe=lambda p: p in instalados, na_path=lambda _: None,
            expandir=lambda c: c.replace("%ProgramFiles(x86)%", r"C:\Program Files (x86)"),
        )
        self.assertIsNotNone(achado)
        self.assertTrue(achado.lower().endswith("msedge.exe"))

    def test_windows_prefere_edge_a_chrome(self):
        # Os dois instalados: a ordem de CAMINHOS_APP decide, e Edge vem antes
        # porque já vem com o Windows 11 (não exige instalar nada).
        achado = serve.achar_navegador_app(
            sistema="win32", existe=lambda p: True, na_path=lambda _: None, expandir=lambda c: c
        )
        self.assertIn("msedge.exe", achado.lower())

    def test_windows_expande_variavel_de_ambiente(self):
        # os.path.expandvars não entende %VAR% fora do Windows, então o expansor
        # é injetado: o que está em teste é que o serve.py EXPANDE antes de usar.
        def expandir(caminho):
            return (caminho.replace("%ProgramFiles(x86)%", r"C:\Program Files (x86)")
                           .replace("%ProgramFiles%", r"C:\Program Files")
                           .replace("%LocalAppData%", r"C:\Users\eu\AppData\Local"))

        alvo = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
        achado = serve.achar_navegador_app(
            sistema="win32", existe=lambda p: p == alvo, na_path=lambda _: None, expandir=expandir
        )
        self.assertEqual(achado, alvo)
        self.assertNotIn("%ProgramFiles%", achado)

    def test_linux_procura_no_path(self):
        chamado = []

        def na_path(nome):
            chamado.append(nome)
            return "/usr/bin/google-chrome" if nome == "google-chrome" else None

        achado = serve.achar_navegador_app(sistema="linux", existe=lambda p: False, na_path=na_path)
        self.assertEqual(achado, "/usr/bin/google-chrome")
        self.assertIn("google-chrome", chamado)

    def test_sem_navegador_devolve_none_em_vez_de_explodir(self):
        # Sem Edge/Chrome o serve.py tem que cair no navegador padrão, não quebrar.
        achado = serve.achar_navegador_app(sistema="win32", existe=lambda p: False, na_path=lambda _: None)
        self.assertIsNone(achado)

    def test_caminho_extra_tem_prioridade(self):
        achado = serve.achar_navegador_app(
            sistema="win32", caminho_extra=r"C:\navegadores\meu-edge.exe",
            existe=lambda p: p.endswith("meu-edge.exe"), na_path=lambda _: None,
        )
        self.assertTrue(achado.endswith("meu-edge.exe"))

    def test_caminho_extra_inexistente_nao_impede_a_busca_normal(self):
        alvo = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
        achado = serve.achar_navegador_app(
            sistema="win32", caminho_extra=r"C:\navegadores\fantasma.exe",
            existe=lambda p: p == alvo, na_path=lambda _: None,
            expandir=lambda c: c.replace("%ProgramFiles%", r"C:\Program Files"),
        )
        self.assertEqual(achado, alvo)


class MontarComandoTests(unittest.TestCase):
    def test_tem_a_flag_app_com_a_url(self):
        cmd = serve.montar_comando_app("msedge.exe", "http://localhost:8080/", "C:\\perfil")
        self.assertEqual(cmd[0], "msedge.exe")
        self.assertIn("--app=http://localhost:8080/", cmd)

    def test_user_data_dir_proprio_e_obrigatorio(self):
        # Sem isto o Chromium ignora --app quando o navegador já está aberto e
        # joga o app numa aba do perfil em uso — o app deixaria de parecer app.
        cmd = serve.montar_comando_app("msedge.exe", "http://localhost:8080/", "C:\\perfil")
        self.assertTrue(any(c.startswith("--user-data-dir=") for c in cmd))
        self.assertIn("--user-data-dir=C:\\perfil", cmd)

    def test_tamanho_da_janela_vem_no_comando(self):
        cmd = serve.montar_comando_app("chrome", "http://localhost:8080/", "/tmp/p", largura=1280, altura=720)
        self.assertIn("--window-size=1280,720", cmd)

    def test_nao_pede_para_ser_o_navegador_padrao(self):
        # Primeira execução não pode interromper o usuário com diálogo de padrão.
        cmd = serve.montar_comando_app("chrome", "http://localhost:8080/", "/tmp/p")
        self.assertIn("--no-first-run", cmd)
        self.assertIn("--no-default-browser-check", cmd)

    def test_url_vai_inteira_sem_quebrar_no_sinal_de_igual(self):
        url = "http://127.0.0.1:9000/?a=b&c=d"
        cmd = serve.montar_comando_app("chrome", url, "/tmp/p")
        self.assertIn(f"--app={url}", cmd)

    def test_devolve_lista_e_nao_string(self):
        # Lista passa direto para o subprocess sem precisar de shell=True.
        cmd = serve.montar_comando_app("chrome", "http://localhost:8080/", "/tmp/p")
        self.assertIsInstance(cmd, list)
        self.assertTrue(all(isinstance(parte, str) for parte in cmd))


class PortaLivreTests(unittest.TestCase):
    def test_devolve_a_porta_inicial_quando_esta_livre(self):
        import socket

        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            porta_livre = s.getsockname()[1]
        # A porta acabou de ser liberada; em CI ninguém corre para pegá-la.
        self.assertEqual(serve.porta_livre(porta_livre), porta_livre)

    def test_pula_porta_ocupada(self):
        import socket

        ocupante = socket.socket()
        ocupante.bind(("127.0.0.1", 0))
        ocupada = ocupante.getsockname()[1]
        try:
            achada = serve.porta_livre(ocupada, tentativas=5)
            self.assertNotEqual(achada, ocupada)
        finally:
            ocupante.close()

    def test_sem_porta_livre_sai_com_erro_explicado(self):
        # host inválido faz todo bind falhar — exercita a mensagem de desistência.
        with self.assertRaises(SystemExit) as ctx:
            serve.porta_livre(1, tentativas=2, host="host.invalido.local")
        self.assertIn("Nenhuma porta livre", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
