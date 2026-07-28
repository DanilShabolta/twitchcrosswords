const express = require('express');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const config = require('./config');
const CrosswordGenerator = require('./src/crosswordGenerator');
const CrosswordFetcher = require('./src/crosswordFetcher');
const TwitchBot = require('./src/bot');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Определяем режим: HTTPS (для Twitch Extension) или HTTP (для локального OBS)
const useHttps = config.HTTPS_ENABLED &&
  fs.existsSync(config.SSL_KEY_PATH) &&
  fs.existsSync(config.SSL_CERT_PATH);

let server;
if (useHttps) {
  const sslOptions = {
    key:  fs.readFileSync(config.SSL_KEY_PATH),
    cert: fs.readFileSync(config.SSL_CERT_PATH)
  };
  server = https.createServer(sslOptions, app);

  // HTTP → HTTPS редирект (порт 80 → 443)
  const httpRedirect = http.createServer((req, res) => {
    const host = req.headers.host ? req.headers.host.split(':')[0] : 'localhost';
    const httpsPort = config.HTTPS_PORT !== 443 ? `:${config.HTTPS_PORT}` : '';
    res.writeHead(301, { Location: `https://${host}${httpsPort}${req.url}` });
    res.end();
  });
  httpRedirect.listen(80, () => {
    console.log(`↪  HTTP→HTTPS редирект запущен на порту 80`);
  });
} else {
  server = http.createServer(app);
}

const wss = new WebSocket.Server({ server });

const LEADERBOARD_FILE = path.join(__dirname, 'data', 'leaderboard.json');

// Загрузка топа за все время из файла
function loadAllTimeLeaderboard() {
  try {
    if (fs.existsSync(LEADERBOARD_FILE)) {
      const data = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Ошибка чтения leaderboard.json:", e.message);
  }
  return {};
}

// Сохранение топа за все время в файл
function saveAllTimeLeaderboard() {
  try {
    const dir = path.dirname(LEADERBOARD_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(gameState.allTimeLeaderboard, null, 2), 'utf8');
  } catch (e) {
    console.error("Ошибка сохранения leaderboard.json:", e.message);
  }
}

// Игровое состояние
let gameState = {
  active: false,
  channel: config.TWITCH_CHANNEL,
  currentRound: 1,
  gameData: null, // { rows, cols, grid, cellNumbers, words }
  leaderboard: {}, // { username: { points: 100, solvedCount: 5 } } - Раунд
  allTimeLeaderboard: loadAllTimeLeaderboard(), // { username: { points: 500, solvedCount: 20 } } - Всё время
  recentActivity: [], // Последние события (кто что угадал / ошибочные попытки)
  stats: {
    totalWords: 0,
    solvedWords: 0,
    progressPercent: 0
  }
};

const generator = new CrosswordGenerator(19);

// Функция добавления события в лог
function addActivity(text, type = "info") {
  const item = {
    id: Date.now() + Math.random(),
    text,
    type, // 'info' | 'success' | 'error' | 'system'
    time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  };
  gameState.recentActivity.unshift(item);
  if (gameState.recentActivity.length > 30) gameState.recentActivity.pop();
  return item;
}

// Запуск нового кроссворда
function startNewGame(wordCount = 10, customWords = null, title = null) {
  const crossword = generator.generate(customWords, wordCount);

  if (!crossword) {
    console.error("Не удалось сгенерировать кроссворд!");
    return false;
  }

  gameState.active = true;
  gameState.gameData = crossword;
  gameState.stats = {
    totalWords: crossword.words.length,
    solvedWords: 0,
    progressPercent: 0
  };

  const titleMsg = title ? ` (${title})` : ``;
  addActivity(`🏁 Запущен новый кроссворд${titleMsg} (${crossword.words.length} слов)!`, "system");
  broadcastState();
  return true;
}

// Обработка ответа зрителя из чата
function handleViewerAnswer({ username, questionNumber, answer }) {
  if (!gameState.active || !gameState.gameData) return;

  const wordObj = gameState.gameData.words.find(w => w.number === questionNumber);

  if (!wordObj) {
    return; // Слова с таким номером нет в кроссворде
  }

  if (wordObj.solved) {
    return; // Слово уже отгадано
  }

  // Нормализация текста (верхний регистр, замена Ё -> Е, удаление пробелов)
  const normTarget = wordObj.word.toUpperCase().replace(/Ё/g, 'Е').trim();
  const normInput = answer.toUpperCase().replace(/Ё/g, 'Е').replace(/\s+/g, '').trim();

  if (normInput === normTarget) {
    // ВЕРНО!
    wordObj.solved = true;
    wordObj.solvedBy = username;

    // Открываем буквы в сетке
    const { row, col, direction, word } = wordObj;
    for (let i = 0; i < word.length; i++) {
      const r = direction === "down" ? row + i : row;
      const c = direction === "across" ? col + i : col;
      if (gameState.gameData.grid[r] && gameState.gameData.grid[r][c]) {
        gameState.gameData.grid[r][c].revealed = true;
      }
    }

    // Начисление очков
    const earnedPoints = word.length * config.POINTS_PER_LETTER + config.POINTS_FIRST_SOLVER_BONUS;

    // Топ за раунд
    if (!gameState.leaderboard[username]) {
      gameState.leaderboard[username] = { points: 0, solvedCount: 0 };
    }
    gameState.leaderboard[username].points += earnedPoints;
    gameState.leaderboard[username].solvedCount += 1;

    // Топ за ВСЁ время
    if (!gameState.allTimeLeaderboard[username]) {
      gameState.allTimeLeaderboard[username] = { points: 0, solvedCount: 0 };
    }
    gameState.allTimeLeaderboard[username].points += earnedPoints;
    gameState.allTimeLeaderboard[username].solvedCount += 1;

    // Сохраняем топ за всё время
    saveAllTimeLeaderboard();

    // Обновляем статистику
    gameState.stats.solvedWords += 1;
    gameState.stats.progressPercent = Math.round((gameState.stats.solvedWords / gameState.stats.totalWords) * 100);

    const announceMsg = `🎉 @${username} угадал(а) слово #${wordObj.number} (${wordObj.word})! (+${earnedPoints} очков)`;
    addActivity(announceMsg, "success");

    // Отправляем ответ в Twitch чат
    bot.sendMessage(announceMsg);

    // Проверка на завершение кроссворда (100%)
    if (gameState.stats.solvedWords >= gameState.stats.totalWords) {
      addActivity(`🏆 Кроссворд полностью отгадан! Новый раунд через ${config.AUTO_NEW_GAME_DELAY_SEC} сек.`, "system");
      bot.sendMessage(`🏆 Кроссворд пройден на 100%! Поздравляем победителей! Следующая игра скоро...`);
      setTimeout(() => {
        gameState.currentRound += 1;
        startNewGame(10);
      }, config.AUTO_NEW_GAME_DELAY_SEC * 1000);
    }

    broadcastState();
  } else {
    // НЕВЕРНО!
    const wrongMsg = `❌ @${username}: "#${wordObj.number} ${answer}" — неверно!`;
    addActivity(wrongMsg, "error");

    // Уведомление в Twitch чат о неверном ответе
    bot.sendMessage(`❌ @${username}, слово #${wordObj.number} неверно!`);

    broadcastState();
  }
}

// Инициализация Twitch Бота
const bot = new TwitchBot(
  (data) => handleViewerAnswer(data),
  (log) => addActivity(log, "info")
);

// Подключаем бота к чату
bot.connect();

// Рассылка текущего состояния всем WebSocket клиентам
function broadcastState() {
  const payload = JSON.stringify({
    type: 'STATE_UPDATE',
    data: gameState
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// WebSocket подключения зрителей и оверлея
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'STATE_UPDATE',
    data: gameState
  }));

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message);
      if (parsed.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
      }
    } catch (e) {}
  });
});

// REST API Endpoints
app.get('/api/state', (req, res) => {
  res.json(gameState);
});

app.post('/api/new-game', (req, res) => {
  const { wordCount } = req.body;
  const success = startNewGame(wordCount || 10);
  res.json({ success, gameState });
});

app.get('/api/themes', (req, res) => {
  res.json(CrosswordFetcher.getThemes());
});

app.post('/api/load-online-crossword', async (req, res) => {
  try {
    const { source, category, url } = req.body;
    let fetchedData = null;

    if (source === 'url' && url) {
      addActivity(`🌐 Загрузка кроссворда по ссылке: ${url}...`, "system");
      fetchedData = await CrosswordFetcher.fetchFromUrl(url);
    } else {
      addActivity(`🎲 Загрузка случайного кроссворда из интернета...`, "system");
      fetchedData = await CrosswordFetcher.fetchRandomOnline(category);
    }

    if (!fetchedData || !fetchedData.words || fetchedData.words.length === 0) {
      return res.status(400).json({ error: "Не удалось извлечь слова для кроссворда" });
    }

    const success = startNewGame(fetchedData.words.length, fetchedData.words, fetchedData.title);
    if (success) {
      res.json({ success: true, title: fetchedData.title, wordCount: fetchedData.words.length, gameState });
    } else {
      res.status(500).json({ error: "Ошибка при генерации сетки кроссворда" });
    }
  } catch (err) {
    console.error("Ошибка загрузки онлайн-кроссворда:", err);
    res.status(400).json({ error: err.message || "Ошибка загрузки с сайта" });
  }
});

app.post('/api/channel', (req, res) => {
  const { channel } = req.body;
  if (channel) {
    gameState.channel = channel;
    bot.setChannel(channel);
    broadcastState();
    res.json({ success: true, channel });
  } else {
    res.status(400).json({ error: "Канал не указан" });
  }
});

app.post('/api/bot-config', (req, res) => {
  const { channel, token, botUsername } = req.body;
  if (!channel || !token) {
    return res.status(400).json({ error: "Канал и токен обязательны" });
  }
  // Обновляем конфиг бота на лету
  bot.setToken(token);
  bot.setBotUsername(botUsername || config.BOT_USERNAME);
  if (channel !== gameState.channel) {
    gameState.channel = channel;
  }
  bot.setChannel(channel);
  bot.reconnect();
  broadcastState();
  res.json({ success: true, channel, botUsername: bot.botUsername });
});

app.post('/api/reveal-word', (req, res) => {
  const { wordNumber } = req.body;
  if (!gameState.gameData) return res.status(400).json({ error: "Игра не активна" });

  const wordObj = gameState.gameData.words.find(w => w.number === wordNumber);
  if (wordObj && !wordObj.solved) {
    handleViewerAnswer({ username: "Ведущий/Подсказка", questionNumber: wordNumber, answer: wordObj.word });
    res.json({ success: true });
  } else {
    res.status(400).json({ error: "Слово уже отгадано или не найдено" });
  }
});

// Запуск первой игры при старте сервера
startNewGame(10);

const listenPort = useHttps ? config.HTTPS_PORT : config.PORT;
server.listen(listenPort, () => {
  const protocol = useHttps ? 'https' : 'http';
  const localUrl = `${protocol}://localhost:${listenPort}`;
  const publicUrl = config.PUBLIC_URL || localUrl;

  console.log(`===================================================`);
  console.log(`🚀 Twitch Crossword Extension Server запущен!`);
  if (useHttps) {
    console.log(`🔒 Режим: HTTPS (готово для Twitch Extension)`);
  } else {
    console.log(`⚠️  Режим: HTTP (только для OBS/локального тестирования)`);
    console.log(`   Для Twitch Extension нужен HTTPS — см. SETUP.md`);
  }
  console.log(`🌐 Публичный URL:  ${publicUrl}`);
  console.log(`🌐 Локальный URL:  ${localUrl}`);
  console.log(`🎛️ Панель стримера: ${localUrl}/dashboard.html`);
  console.log(`⚙️  Конфиг расш.:   ${localUrl}/config.html`);
  console.log(`===================================================`);
});
