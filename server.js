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

// Определяем режим: HTTPS (локальные сертификаты) или HTTP (для Railway / OBS)
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
const generator = new CrosswordGenerator(19);

// Инициализация мульти-канального бота Twitch
const bot = new TwitchBot(
  (channel, data) => handleViewerAnswer(channel, data),
  (log) => console.log(log)
);
bot.connect();

// Хранилище мульти-канальных комнат (Multi-tenant)
// rooms: Map<channelName, RoomState>
const rooms = new Map();

function getLeaderboardPath(channel) {
  const clean = (channel || 'default').toLowerCase().replace(/[^a-z0-9_]/g, '');
  return path.join(__dirname, 'data', 'leaderboards', `leaderboard_${clean}.json`);
}

function loadAllTimeLeaderboard(channel) {
  try {
    const filePath = getLeaderboardPath(channel);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error(`Ошибка чтения leaderboard для #${channel}:`, e.message);
  }
  return {};
}

function saveAllTimeLeaderboard(channel, leaderboardData) {
  try {
    const filePath = getLeaderboardPath(channel);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(leaderboardData, null, 2), 'utf8');
  } catch (e) {
    console.error(`Ошибка сохранения leaderboard для #${channel}:`, e.message);
  }
}

function cleanChannelName(channel) {
  if (!channel || typeof channel !== 'string') {
    return (config.TWITCH_CHANNEL || 'default').toLowerCase().replace('#', '').trim();
  }
  return channel.toLowerCase().replace('#', '').trim() || 'default';
}

function addActivity(room, text, type = "info") {
  const item = {
    id: Date.now() + Math.random(),
    text,
    type,
    time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  };
  room.recentActivity.unshift(item);
  if (room.recentActivity.length > 30) room.recentActivity.pop();
  return item;
}

function getOrCreateRoom(channelInput) {
  const channel = cleanChannelName(channelInput);

  if (rooms.has(channel)) {
    return rooms.get(channel);
  }

  const room = {
    channel,
    active: false,
    currentRound: 1,
    gameData: null,
    leaderboard: {},
    allTimeLeaderboard: loadAllTimeLeaderboard(channel),
    recentActivity: [],
    stats: {
      totalWords: 0,
      solvedWords: 0,
      progressPercent: 0
    },
    clients: new Set()
  };

  rooms.set(channel, room);

  // Запускаем первую игру для этого канала
  startNewGameForRoom(room, 10);

  // Бот входит на чат-канал
  bot.joinChannel(channel);

  return room;
}

function startNewGameForRoom(room, wordCount = 10, customWords = null, title = null) {
  const crossword = generator.generate(customWords, wordCount);
  if (!crossword) {
    console.error(`Не удалось сгенерировать кроссворд для канала #${room.channel}`);
    return false;
  }

  room.active = true;
  room.gameData = crossword;
  room.stats = {
    totalWords: crossword.words.length,
    solvedWords: 0,
    progressPercent: 0
  };

  const titleMsg = title ? ` (${title})` : ``;
  addActivity(room, `🏁 Запущен новый кроссворд${titleMsg} (${crossword.words.length} слов)!`, "system");
  broadcastStateToRoom(room);
  return true;
}

function handleViewerAnswer(channelName, { username, questionNumber, answer }) {
  const room = getOrCreateRoom(channelName);
  if (!room.active || !room.gameData) return;

  const wordObj = room.gameData.words.find(w => w.number === questionNumber);

  if (!wordObj || wordObj.solved) return;

  const normTarget = wordObj.word.toUpperCase().replace(/Ё/g, 'Е').trim();
  const normInput = answer.toUpperCase().replace(/Ё/g, 'Е').replace(/\s+/g, '').trim();

  if (normInput === normTarget) {
    wordObj.solved = true;
    wordObj.solvedBy = username;

    const { row, col, direction, word } = wordObj;
    for (let i = 0; i < word.length; i++) {
      const r = direction === "down" ? row + i : row;
      const c = direction === "across" ? col + i : col;
      if (room.gameData.grid[r] && room.gameData.grid[r][c]) {
        room.gameData.grid[r][c].revealed = true;
      }
    }

    const earnedPoints = word.length * config.POINTS_PER_LETTER + config.POINTS_FIRST_SOLVER_BONUS;

    if (!room.leaderboard[username]) {
      room.leaderboard[username] = { points: 0, solvedCount: 0 };
    }
    room.leaderboard[username].points += earnedPoints;
    room.leaderboard[username].solvedCount += 1;

    if (!room.allTimeLeaderboard[username]) {
      room.allTimeLeaderboard[username] = { points: 0, solvedCount: 0 };
    }
    room.allTimeLeaderboard[username].points += earnedPoints;
    room.allTimeLeaderboard[username].solvedCount += 1;

    saveAllTimeLeaderboard(room.channel, room.allTimeLeaderboard);

    room.stats.solvedWords += 1;
    room.stats.progressPercent = Math.round((room.stats.solvedWords / room.stats.totalWords) * 100);

    const announceMsg = `🎉 @${username} угадал(а) слово #${wordObj.number} (${wordObj.word})! (+${earnedPoints} очков)`;
    addActivity(room, announceMsg, "success");
    bot.sendMessage(room.channel, announceMsg);

    if (room.stats.solvedWords >= room.stats.totalWords) {
      addActivity(room, `🏆 Кроссворд полностью отгадан! Новый раунд через ${config.AUTO_NEW_GAME_DELAY_SEC} сек.`, "system");
      bot.sendMessage(room.channel, `🏆 Кроссворд пройден на 100%! Поздравляем победителей! Следующая игра скоро...`);
      setTimeout(() => {
        room.currentRound += 1;
        startNewGameForRoom(room, 10);
      }, config.AUTO_NEW_GAME_DELAY_SEC * 1000);
    }

    broadcastStateToRoom(room);
  } else {
    const wrongMsg = `❌ @${username}: "#${wordObj.number} ${answer}" — неверно!`;
    addActivity(room, wrongMsg, "error");
    bot.sendMessage(room.channel, `❌ @${username}, слово #${wordObj.number} неверно!`);
    broadcastStateToRoom(room);
  }
}

function broadcastStateToRoom(room) {
  const payload = JSON.stringify({
    type: 'STATE_UPDATE',
    data: {
      active: room.active,
      channel: room.channel,
      currentRound: room.currentRound,
      gameData: room.gameData,
      leaderboard: room.leaderboard,
      allTimeLeaderboard: room.allTimeLeaderboard,
      recentActivity: room.recentActivity,
      stats: room.stats
    }
  });

  room.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// WebSocket подключения подписчиков конкретной комнаты
wss.on('connection', (ws, req) => {
  const parsedUrl = new URL(req.url, 'http://localhost');
  const channelParam = parsedUrl.searchParams.get('channel');
  const room = getOrCreateRoom(channelParam);

  room.clients.add(ws);

  // Отправляем текущее состояние комнаты
  ws.send(JSON.stringify({
    type: 'STATE_UPDATE',
    data: {
      active: room.active,
      channel: room.channel,
      currentRound: room.currentRound,
      gameData: room.gameData,
      leaderboard: room.leaderboard,
      allTimeLeaderboard: room.allTimeLeaderboard,
      recentActivity: room.recentActivity,
      stats: room.stats
    }
  }));

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message);
      if (parsed.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    room.clients.delete(ws);
  });
});

// REST API Endpoints

app.get('/api/state', (req, res) => {
  const room = getOrCreateRoom(req.query.channel);
  res.json({
    active: room.active,
    channel: room.channel,
    currentRound: room.currentRound,
    gameData: room.gameData,
    leaderboard: room.leaderboard,
    allTimeLeaderboard: room.allTimeLeaderboard,
    recentActivity: room.recentActivity,
    stats: room.stats
  });
});

app.post('/api/new-game', (req, res) => {
  const { channel, wordCount } = req.body;
  const room = getOrCreateRoom(channel);
  const success = startNewGameForRoom(room, wordCount || 10);
  res.json({ success, channel: room.channel });
});

app.get('/api/themes', (req, res) => {
  res.json(CrosswordFetcher.getThemes());
});

app.post('/api/load-online-crossword', async (req, res) => {
  try {
    const { channel, source, category, url } = req.body;
    const room = getOrCreateRoom(channel);
    let fetchedData = null;

    if (source === 'url' && url) {
      addActivity(room, `🌐 Загрузка кроссворда по ссылке: ${url}...`, "system");
      fetchedData = await CrosswordFetcher.fetchFromUrl(url);
    } else {
      addActivity(room, `🎲 Загрузка случайного кроссворда из интернета...`, "system");
      fetchedData = await CrosswordFetcher.fetchRandomOnline(category);
    }

    if (!fetchedData || !fetchedData.words || fetchedData.words.length === 0) {
      return res.status(400).json({ error: "Не удалось извлечь слова для кроссворда" });
    }

    const success = startNewGameForRoom(room, fetchedData.words.length, fetchedData.words, fetchedData.title);
    if (success) {
      res.json({ success: true, title: fetchedData.title, wordCount: fetchedData.words.length, channel: room.channel });
    } else {
      res.status(500).json({ error: "Ошибка при генерации сетки кроссворда" });
    }
  } catch (err) {
    console.error("Ошибка загрузки онлайн-кроссворда:", err);
    res.status(400).json({ error: err.message || "Ошибка загрузки с сайта" });
  }
});

app.post('/api/bot-config', (req, res) => {
  const { channel, token, botUsername } = req.body;
  if (!channel || !token) {
    return res.status(400).json({ error: "Канал и токен обязательны" });
  }
  bot.setToken(token);
  bot.setBotUsername(botUsername || config.BOT_USERNAME);
  const room = getOrCreateRoom(channel);
  bot.joinChannel(room.channel);
  bot.reconnect();
  res.json({ success: true, channel: room.channel, botUsername: bot.botUsername });
});

app.post('/api/reveal-word', (req, res) => {
  const { channel, wordNumber } = req.body;
  const room = getOrCreateRoom(channel);
  if (!room.gameData) return res.status(400).json({ error: "Игра не активна" });

  const wordObj = room.gameData.words.find(w => w.number === wordNumber);
  if (wordObj && !wordObj.solved) {
    handleViewerAnswer(room.channel, { username: "Ведущий/Подсказка", questionNumber: wordNumber, answer: wordObj.word });
    res.json({ success: true });
  } else {
    res.status(400).json({ error: "Слово уже отгадано или не найдено" });
  }
});

// Инициализация комнаты по умолчанию
getOrCreateRoom(config.TWITCH_CHANNEL);

const listenPort = useHttps ? config.HTTPS_PORT : config.PORT;
server.listen(listenPort, () => {
  const protocol = useHttps ? 'https' : 'http';
  const localUrl = `${protocol}://localhost:${listenPort}`;
  const publicUrl = config.PUBLIC_URL || localUrl;

  console.log(`===================================================`);
  console.log(`🚀 Twitch Crossword Extension Server запущен (Multi-tenant)!`);
  console.log(`🌐 Публичный URL:  ${publicUrl}`);
  console.log(`🌐 Локальный URL:  ${localUrl}`);
  console.log(`===================================================`);
});
