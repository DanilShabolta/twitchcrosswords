const WebSocket = require('ws');
const config = require('../config');

/**
 * Twitch IRC Chat Bot using WebSocket connection.
 * Listens for user guesses like "1. свияж" or "1 свияж" in Twitch Chat.
 */
class TwitchBot {
  constructor(onAnswerReceived, onLogMessage) {
    this.ws = null;
    this.channel = (config.TWITCH_CHANNEL || "channel_name").toLowerCase().replace('#', '');
    this.token = config.TWITCH_TOKEN;
    this.botUsername = (config.BOT_USERNAME || "CrosswordBot").toLowerCase();
    this.onAnswerReceived = onAnswerReceived;
    this.onLogMessage = onLogMessage || console.log;
    this.pingInterval = null;
    this.isConnected = false;
  }

  connect() {
    this.onLogMessage(`[TwitchBot] Подключение к чату Twitch для канала: #${this.channel}...`);
    this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

    this.ws.on('open', () => {
      this.isConnected = true;
      this.onLogMessage(`[TwitchBot] WebSocket соединение установлено.`);

      // Отправляем команды авторизации IRC Twitch
      const passToken = this.token.startsWith('oauth:') ? this.token : `oauth:${this.token}`;
      this.ws.send(`CAP REQ :twitch.tv/tags twitch.tv/commands`);
      this.ws.send(`PASS ${passToken}`);
      this.ws.send(`NICK ${this.botUsername}`);
      this.ws.send(`JOIN #${this.channel}`);

      // Запускаем PING каждые 4 минуты для поддержания связи
      this.pingInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send('PING :tmi.twitch.tv');
        }
      }, 240000);
    });

    this.ws.on('message', (data) => {
      const message = data.toString();
      this.handleIrcMessage(message);
    });

    this.ws.on('error', (err) => {
      this.onLogMessage(`[TwitchBot Error] ${err.message}`);
    });

    this.ws.on('close', () => {
      this.isConnected = false;
      this.onLogMessage(`[TwitchBot] Соединение разорвано. Переподключение через 5 секунд...`);
      clearInterval(this.pingInterval);
      setTimeout(() => this.connect(), 5000);
    });
  }

  setToken(newToken) {
    if (!newToken) return;
    this.token = newToken.startsWith('oauth:') ? newToken : `oauth:${newToken}`;
  }

  setBotUsername(newUsername) {
    if (!newUsername) return;
    this.botUsername = newUsername.toLowerCase();
  }

  reconnect() {
    this.onLogMessage(`[TwitchBot] Переподключение с новыми настройками...`);
    if (this.ws) {
      this._manualReconnect = true;
      this.ws.terminate();
    } else {
      this.connect();
    }
  }

  setChannel(newChannel) {
    if (!newChannel) return;
    const cleanChannel = newChannel.toLowerCase().replace('#', '').trim();
    if (this.channel !== cleanChannel) {
      if (this.isConnected && this.ws) {
        this.ws.send(`PART #${this.channel}`);
        this.ws.send(`JOIN #${cleanChannel}`);
      }
      this.channel = cleanChannel;
      this.onLogMessage(`[TwitchBot] Переключен на канал #${this.channel}`);
    }
  }

  sendMessage(text) {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(`PRIVMSG #${this.channel} :${text}`);
    }
  }

  handleIrcMessage(rawMessage) {
    const lines = rawMessage.split('\r\n');

    lines.forEach(line => {
      if (!line) return;

      // Ответ на PING от Twitch
      if (line.startsWith('PING')) {
        this.ws.send('PONG :tmi.twitch.tv');
        return;
      }

      // Парсим PRIVMSG (сообщения из чата)
      if (line.includes('PRIVMSG')) {
        this.parseChatMessage(line);
      }
    });
  }

  parseChatMessage(rawLine) {
    try {
      let displayName = "Viewer";
      let username = "viewer";

      // Извлекаем display-name из тегов Twitch IRC
      const tagMatch = rawLine.match(/display-name=([^;]+)/);
      if (tagMatch && tagMatch[1]) {
        displayName = tagMatch[1];
      }

      // Извлекаем ник из префикса юзера
      const userMatch = rawLine.match(/:([^!]+)!/);
      if (userMatch && userMatch[1]) {
        username = userMatch[1];
        if (displayName === "Viewer") displayName = username;
      }

      // Извлекаем сам текст сообщения
      const msgIndex = rawLine.indexOf(`PRIVMSG #${this.channel} :`);
      if (msgIndex === -1) return;

      const chatText = rawLine.substring(msgIndex + `PRIVMSG #${this.channel} :`.length).trim();

      // Ищем шаблоны вроде "1. свияжск", "1 свияжск", "!1 свияжск", "#1 свияжск", "1: свияжск"
      const regex = /^(?:!|#)?(\d+)[\.\s:\-]+\s*(.+)$/i;
      const match = chatText.match(regex);

      if (match) {
        const questionNum = parseInt(match[1], 10);
        const answerText = match[2].trim();

        if (!isNaN(questionNum) && answerText) {
          this.onAnswerReceived({
            username: displayName,
            userLogin: username,
            questionNumber: questionNum,
            answer: answerText,
            rawText: chatText
          });
        }
      }
    } catch (e) {
      console.error("[TwitchBot] Ошибка парсинга сообщения:", e);
    }
  }
}

module.exports = TwitchBot;
