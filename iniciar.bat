@echo off
rem Abre JARVIS como aplicacion (servidor local oculto + ventana propia)
cd /d "%~dp0"
start "" wscript.exe "%~dp0JARVIS.vbs"
