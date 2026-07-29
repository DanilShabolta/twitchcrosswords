@echo off
title Twitch Crossword Extension Launcher
echo ===================================================
echo 🚀 Запуск сервера и туннеля Twitch Crossword...
echo ===================================================

:: Запуск сервера Node.js в отдельном окне
start "Twitch Crossword Server" cmd /k "cd /d %~dp0 && npm start"

:: Небольшая пауза для инициализации сервера
timeout /t 3 /nobreak > nul

:: Запуск постоянного туннеля c постоянным адресом
start "Twitch Crossword Tunnel" cmd /k "npx --yes localtunnel --port 3000 --subdomain cptponos-crossword"

echo ===================================================
echo ✅ Сервер и туннель успешно запущены!
echo 🔗 ПОСТОЯННАЯ ССЫЛКА ДЛЯ TWITCH:
echo    https://cptponos-crossword.loca.lt/
echo ===================================================
