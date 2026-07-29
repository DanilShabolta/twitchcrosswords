@echo off
title Twitch Crossword Extension Launcher
echo ===================================================
echo 🚀 Запуск сервера и туннеля Twitch Crossword...
echo ===================================================

:: Запуск сервера Node.js в отдельном окне
start "1. Twitch Server" cmd /k "cd /d %~dp0 && npm start"

:: Небольшая пауза для инициализации сервера
timeout /t 3 /nobreak > nul

:: Запуск туннеля Cloudflare
start "2. Cloudflare Tunnel" cmd /k "cloudflared tunnel --url http://localhost:3000"

echo ===================================================
echo ✅ Сервер и туннель Cloudflare запущены!
echo 📌 Открой окно "2. Cloudflare Tunnel" и скопируй оттуда ссылку https://...trycloudflare.com
echo ===================================================
