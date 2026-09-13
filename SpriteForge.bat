@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
set "PYTHONUTF8=1"
chcp 65001 >nul 2>nul

if not exist "%~dp0spriteforge\serve.py" (
    echo ERRO: spriteforge\serve.py nao encontrado ao lado do SpriteForge.bat.
    set "RC=1"
    goto :finish
)

where py >nul 2>nul
if not errorlevel 1 (
    py -3 -c "import sys; raise SystemExit(sys.version_info < (3, 8))" >nul 2>nul
    if not errorlevel 1 goto :use_py
)

where python >nul 2>nul
if not errorlevel 1 (
    python -c "import sys; raise SystemExit(sys.version_info < (3, 8))" >nul 2>nul
    if not errorlevel 1 goto :use_python
)

echo ERRO: Python 3.8 ou superior nao encontrado.
echo Instale o Python e marque a opcao "Add Python to PATH" no instalador.
echo Sem Python o app nao abre: index.html por duplo clique nao carrega modulos ES.
set "RC=1"
goto :finish

:use_py
py -3 "%~dp0spriteforge\serve.py" %*
set "RC=%ERRORLEVEL%"
goto :finish

:use_python
python "%~dp0spriteforge\serve.py" %*
set "RC=%ERRORLEVEL%"

:finish
if not "%RC%"=="0" (
    echo.
    echo O SpriteForge terminou com erro. Leia a mensagem acima.
    pause
)
exit /b %RC%
