@echo off
title Detener JARVIS
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8765" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
echo Servidor de JARVIS detenido.
timeout /t 2 >nul
