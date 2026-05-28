@echo off
cd /d "%~dp0"
echo Iniciando o sistema Flor do Cerrado em segundo plano...
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0server.ps1"
echo.
echo Sistema iniciado! Acesse: http://localhost:4173
echo.
echo Feche esta janela. O servidor continuara rodando em segundo plano.
pause
