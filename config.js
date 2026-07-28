require('dotenv').config();

module.exports = {
  // Twitch Chat Configuration
  TWITCH_TOKEN: process.env.TWITCH_TOKEN || "",
  TWITCH_CHANNEL: process.env.TWITCH_CHANNEL || "",
  BOT_USERNAME: process.env.BOT_USERNAME || "CrosswordBot",

  // Server Port Settings
  PORT: process.env.PORT || 3000,          // HTTP порт (или основной если HTTPS отключён)
  HTTPS_PORT: process.env.HTTPS_PORT || 443, // HTTPS порт (443 — стандарт)

  // HTTPS / SSL (нужно для Twitch Extension)
  // Получить бесплатный сертификат: https://letsencrypt.org или через Cloudflare Tunnel
  HTTPS_ENABLED: process.env.HTTPS_ENABLED === 'true' || false,
  SSL_KEY_PATH:  process.env.SSL_KEY_PATH  || './ssl/key.pem',   // путь к private key
  SSL_CERT_PATH: process.env.SSL_CERT_PATH || './ssl/cert.pem',  // путь к certificate

  // Публичный URL сервера (без слеша в конце)
  // Пример: "https://myserver.com" или "https://123.45.67.89"
  // Используется только для вывода в консоль
  PUBLIC_URL: process.env.PUBLIC_URL || '',

  // Game Settings
  POINTS_PER_LETTER: 10,
  POINTS_FIRST_SOLVER_BONUS: 20,
  AUTO_NEW_GAME_DELAY_SEC: 15
};
