@echo off
cd /d "%~dp0"
echo Iniciando o sistema Flor do Cerrado (Node.js - sincronizado com nuvem)...
echo.
start /B node server.js
echo.
echo Sistema iniciado! Acesse: http://localhost:4173
echo.
echo Feche esta janela. O servidor continuara rodando em segundo plano.
pause
