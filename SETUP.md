# 🚀 Руководство по развёртыванию Crossword Bot

## Варианты запуска

| Вариант | Для кого | Зрители видят кроссворд |
|---------|----------|------------------------|
| **OBS Browser Source** | Только для себя | Через OBS — как картинку на стриме |
| **Twitch Extension (self-host)** | Для себя и других стримеров | Прямо в интерфейсе Twitch |
| **Twitch Extension (VPS/хостинг)** | Для всех, круглосуточно | Прямо в интерфейсе Twitch |

---

## 🎮 Вариант 1: OBS Browser Source (самый простой)

Не нужен HTTPS, не нужен белый IP. Кроссворд виден только через трансляцию.

```bash
# 1. Установи зависимости
npm install

# 2. Создай .env файл (скопируй .env.example и заполни токен и канал)
copy .env.example .env

# 3. Запусти сервер
npm start
```

В OBS:
1. Источник → **Браузер (Browser Source)**
2. URL: `http://localhost:3000`
3. Ширина: `1920`, Высота: `1080`

---

## 🌐 Вариант 2: Twitch Extension со своего компьютера (белый IP)

Нужен: **белый IP** + **SSL-сертификат** (HTTPS обязателен для Twitch Extension).

### Шаг 1: Получить SSL-сертификат

#### Способ А: Через Cloudflare Tunnel (бесплатно, не нужен домен)

Cloudflare Tunnel даёт тебе бесплатный HTTPS-адрес вида `https://random.trycloudflare.com`.
Подходит для тестирования. Для стабильной работы нужен домен.

```bash
# Скачай cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
# Запусти туннель (сервер должен быть запущен на порту 3000):
cloudflared tunnel --url http://localhost:3000
```

Скопируй выданный `https://...trycloudflare.com` адрес — это твой PUBLIC_URL.

#### Способ Б: Через Let's Encrypt (нужен домен, постоянный вариант)

```bash
# Установи certbot (Windows: https://certbot.eff.org)
# Получи сертификат для твоего домена:
certbot certonly --standalone -d ТВОЙ_ДОМЕН.com

# Сертификаты окажутся здесь:
# /etc/letsencrypt/live/ТВОЙ_ДОМЕН.com/privkey.pem  (→ SSL_KEY_PATH)
# /etc/letsencrypt/live/ТВОЙ_ДОМЕН.com/fullchain.pem (→ SSL_CERT_PATH)
```

### Шаг 2: Настроить .env

```env
HTTPS_ENABLED=true
HTTPS_PORT=443
SSL_KEY_PATH=./ssl/key.pem
SSL_CERT_PATH=./ssl/cert.pem
PUBLIC_URL=https://ТВОЙ_ДОМЕН_ИЛИ_IP
```

Скопируй файлы сертификата в папку `ssl/` проекта:
```
twitchcrosswards/
  ssl/
    key.pem    ← private key
    cert.pem   ← certificate (fullchain)
```

### Шаг 3: Открыть порты в Windows Firewall

```powershell
# Запусти PowerShell от Администратора:
netsh advfirewall firewall add rule name="Crossword Bot HTTPS" dir=in action=allow protocol=TCP localport=443
netsh advfirewall firewall add rule name="Crossword Bot HTTP" dir=in action=allow protocol=TCP localport=80
```

### Шаг 4: Настроить Twitch Developer Console

1. Открой [dev.twitch.tv/console/extensions](https://dev.twitch.tv/console/extensions)
2. Создай или открой своё расширение
3. Вкладка **Asset Hosting** → выбери **Self-Hosted**
4. Укажи URL:
   - **Testing Base URI**: `https://ТВОЙ_IP_ИЛИ_ДОМЕН/`
   - **Video Overlay Viewer Path**: `/` (файл `index.html`)
   - **Config Page Path**: `/config.html`
   - **Live Config Page Path**: `/dashboard.html`
5. Вкладка **Capabilities** → включи **Video - Fullscreen Overlay**

### Шаг 5: Запустить сервер

```bash
npm start
```

---

## ☁️ Вариант 3: Twitch Extension на хостинге (Railway / Render)

### Railway (бесплатный план, HTTPS автоматически)

1. Зайди на [railway.app](https://railway.app) и создай проект из GitHub репозитория
2. Добавь переменные окружения (Environment Variables):
   ```
   TWITCH_TOKEN=oauth:...
   TWITCH_CHANNEL=название_канала
   PORT=3000
   ```
3. Railway автоматически выдаст HTTPS URL вида `https://crossword-bot.up.railway.app`
4. Укажи этот URL в Twitch Developer Console

### Render (бесплатный план)

1. Зайди на [render.com](https://render.com) → New → Web Service
2. Подключи GitHub репозиторий
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Добавь переменные окружения

---

## 🔧 Переменные окружения

| Переменная | Описание | Пример |
|-----------|----------|--------|
| `TWITCH_TOKEN` | OAuth токен бота | `oauth:abc123...` |
| `TWITCH_CHANNEL` | Название канала (без #) | `cptponos` |
| `BOT_USERNAME` | Логин аккаунта бота | `CrosswordBot` |
| `PORT` | HTTP порт | `3000` |
| `HTTPS_ENABLED` | Включить HTTPS | `true` |
| `HTTPS_PORT` | HTTPS порт | `443` |
| `SSL_KEY_PATH` | Путь к private key | `./ssl/key.pem` |
| `SSL_CERT_PATH` | Путь к certificate | `./ssl/cert.pem` |
| `PUBLIC_URL` | Публичный HTTPS URL | `https://myserver.com` |

---

## 📦 Структура проекта

```
twitchcrosswards/
├── server.js          # Node.js сервер (Express + WebSocket)
├── config.js          # Конфигурация (читает из .env)
├── .env               # Твои секреты (НЕ публикуй в git!)
├── .env.example       # Шаблон .env
├── ssl/               # SSL сертификаты (НЕ публикуй в git!)
│   ├── key.pem
│   └── cert.pem
├── public/
│   ├── index.html     # Оверлей для зрителей (Twitch Extension)
│   ├── config.html    # Страница настройки расширения
│   ├── dashboard.html # Панель управления стримера
│   ├── app.js         # Frontend логика
│   └── style.css      # Стили
├── src/
│   ├── bot.js         # Twitch IRC Chat Bot
│   ├── crosswordGenerator.js
│   ├── crosswordFetcher.js
│   └── dictionary.js
└── data/
    └── leaderboard.json  # Таблица рекордов
```
