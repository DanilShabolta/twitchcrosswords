const WebSocket = require('ws');
const config = require('../config');

/**
 * Multi-channel Twitch IRC Chat Bot.
 * Connects to Twitch IRC WebSocket and listens to multiple channels simultaneously.
 * Parses user guesses like "1. свияж" or "1 свияж" in each channel.
 */
class TwitchBot {
  constructor(onAnswerReceived, onLogMessage) {
    this.ws = null;
    this.channels = new Set();
    this.token = config.TWITCH_TOKEN || "";
    this.botUsername = (config.BOT_USERNAME || "CrosswordBot").toLowerCase();
    this.onAnswerReceived = onAnswerReceived; // (channel, data) => void
    this.onLogMessage = onLogMessage || console.log;
    this.pingInterval = null;
    this.isConnected = false;
  }

  connect() {
    this.onLogMessage(`[TwitchBot] Подключение к IRC чату Twitch...`);
    this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

    this.ws.on('open', () => {
      this.isConnected = true;
      this.onLogMessage(`[TwitchBot] IRC WebSocket соединение установлено.`);

      const passToken = this.token.startsWith('oauth:') ? this.token : `oauth:${this.token}`;
      this.ws.send(`CAP REQ :twitch.tv/tags twitch.tv/commands`);
      this.ws.send(`PASS ${passToken}`);
      this.ws.send(`NICK ${this.botUsername}`);

      // Переподключаемся ко всем затребованным каналам
      this.channels.forEach(ch => {
        this.ws.send(`JOIN #${ch}`);
        this.onLogMessage(`[TwitchBot] Подключен к каналу #${ch}`);
      });

      // PING каждые 4 минуты для поддержания связи
      clearInterval(this.pingInterval);
      this.pingInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send('PING :tmi.twitch.tv');
        }
      }, 240000);
    });

    this.ws.on('message', (data) => {
      this.handleIrcMessage(data.toString());
    });

    this.ws.on('error', (err) => {
      this.onLogMessage(`[TwitchBot Error] ${err.message}`);
    });

    this.ws.on('close', () => {
      this.isConnected = false;
      this.onLogMessage(`[TwitchBot] IRC соединение разорвано. Переподключение через 5 секунд...`);
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
      this.ws.terminate();
    } else {
      this.connect();
    }
  }

  joinChannel(channelName) {
    if (!channelName) return;
    const clean = channelName.toLowerCase().replace('#', '').trim();
    if (!clean) return;

    if (!this.channels.has(clean)) {
      this.channels.add(clean);
      if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(`JOIN #${clean}`);
        this.onLogMessage(`[TwitchBot] Вход на канал #${clean}`);
      }
    }
  }

  leaveChannel(channelName) {
    if (!channelName) return;
    const clean = channelName.toLowerCase().replace('#', '').trim();
    if (this.channels.has(clean)) {
      this.channels.delete(clean);
      if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(`PART #${clean}`);
        this.onLogMessage(`[TwitchBot] Выход с канала #${clean}`);
      }
    }
  }

  sendMessage(channelName, text) {
    if (!channelName || !text) return;
    const clean = channelName.toLowerCase().replace('#', '').trim();
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(`PRIVMSG #${clean} :${text}`);
    }
  }

  handleIrcMessage(rawMessage) {
    const lines = rawMessage.split('\r\n');

    lines.forEach(line => {
      if (!line) return;

      if (line.startsWith('PING')) {
        this.ws.send('PONG :tmi.twitch.tv');
        return;
      }

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

      // Извлекаем ник автора из префикса юзера
      const userMatch = rawLine.match(/:([^!]+)!/);
      if (userMatch && userMatch[1]) {
        username = userMatch[1];
        if (displayName === "Viewer") displayName = username;
      }

      // Извлекаем название канала и текст сообщения
      // Пример PRIVMSG: :nick!nick@user.tmi.twitch.tv PRIVMSG #channelname :text
      const privmsgMatch = rawLine.match(/PRIVMSG #([^\s:]+)\s*:(.+)$/i);
      if (!privmsgMatch) return;

      const channel = privmsgMatch[1].toLowerCase().trim();
      const chatText = privmsgMatch[2].trim();

      // Ищем варианты ответов: "1. свияжск", "1 свияжск", "!1 свияжск", "#1 свияжск"
      const regex = /^(?:!|#)?(\d+)[\.\s:\-]+\s*(.+)$/i;
      const match = chatText.match(regex);

      if (match) {
        const questionNum = parseInt(match[1], 10);
        const answerText = match[2].trim();

        if (!isNaN(questionNum) && answerText) {
          this.onAnswerReceived(channel, {
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
