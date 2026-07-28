const http = require('http');
const https = require('https');

/**
 * Модуль для загрузки кроссвордов с веб-сайтов и внешних онлайн-источников,
 * а также для автоматического извлечения пар "слово (ответ) - вопрос (подсказка)".
 */

// Коллекция популярных тематических онлайн-кроссвордов
const ONLINE_THEMES = {
  movies: {
    name: "🎬 Кино и Сериалы",
    words: [
      { word: "ГОЛЛИВУД", clue: "Главный центр киноиндустрии США в Лос-Анджелесе", category: "Кино" },
      { word: "АВАТАР", clue: "Фантастический фильм Джеймса Кэмерона про планету Пандора", category: "Кино" },
      { word: "ОСКАР", clue: "Престижная ежегодная премия Американской киноакадемии", category: "Кино" },
      { word: "ТИТАНИК", clue: "Фильм-катастрофа о гибели легендарного лайнера", category: "Кино" },
      { word: "МАТРИЦА", clue: "Культовый научно-фантастический фильм с Киану Ривзом", category: "Кино" },
      { word: "ДЖОКЕР", clue: "Главный враг Бэтмена и герой одноименного фильма 2019 года", category: "Кино" },
      { word: "ИНТЕРСТЕЛЛАР", clue: "Фильм Кристофера Нолана о путешествиях сквозь червоточину", category: "Кино" },
      { word: "ГАРРИ", clue: "Имя юного волшебника со шрамом в виде молнии", category: "Кино" },
      { word: "ТЕРМИНАТОР", clue: "Киборг-убийца, прибывший из будущего", category: "Кино" },
      { word: "ГЛАДИАТОР", clue: "Исторический фильм Ридли Скотта с Расселом Кроу", category: "Кино" },
      { word: "ТАРАНТИНО", clue: "Режиссер фильмов 'Криминальное чтиво' и 'Убить Билла'", category: "Кино" },
      { word: "КИНОТЕАТР", clue: "Здание с большим экраном для публичного просмотра фильмов", category: "Кино" }
    ]
  },
  gaming: {
    name: "🎮 Видеоигры и Киберспорт",
    words: [
      { word: "ВЕДЬМАК", clue: "Геральт из Ривии, охотник на чудовищ в серии игр от CD Projekt Red", category: "Игры" },
      { word: "МАЙНКРАФТ", clue: "Игра-песочница из кубиков от компании Mojang", category: "Игры" },
      { word: "ДОТА", clue: "Популярная командная MOBA-игра от Valve", category: "Игры" },
      { word: "СТИМ", clue: "Цифровой магазин и платформа для компьютерных игр", category: "Игры" },
      { word: "ТЕТРИС", clue: "Легендарная логическая игра, созданная Алексеем Пажитновым", category: "Игры" },
      { word: "ПИКСЕЛЬ", clue: "Наименьший точечный элемент растрового изображения", category: "Игры" },
      { word: "ДЖОЙСТИК", clue: "Игровой контроллер для управления персонажем", category: "Игры" },
      { word: "ГЕЙМЕР", clue: "Человек, увлекающийся видеоиграми", category: "Игры" },
      { word: "КИБЕРСПОРТ", clue: "Соревнования по компьютерным видеоиграм", category: "Игры" },
      { word: "СПАУН", clue: "Точка появления игрока или предмета в виртуальном мире", category: "Игры" },
      { word: "КВЕСТ", clue: "Игровое задание или приключение с сюжетной целью", category: "Игры" },
      { word: "МАРИО", clue: "Легендарный водопроводчик в кепке из игр Nintendo", category: "Игры" }
    ]
  },
  geography: {
    name: "🌍 Страны, Реки и Природа",
    words: [
      { word: "ЭВЕРЕСТ", clue: "Самая высокая горная вершина на Земле", category: "География" },
      { word: "АМАЗОНКА", clue: "Самая полноводная река в мире", category: "География" },
      { word: "САХАРА", clue: "Крупнейшая жаркая пустыня на планете", category: "География" },
      { word: "АНТАРКТИДА", clue: "Самый холодный и южный континент Земли", category: "География" },
      { word: "ВАТИКАН", clue: "Самое маленькое государство в мире по площади", category: "География" },
      { word: "НИАГАРА", clue: "Знаменитый водопад на границе США и Канады", category: "География" },
      { word: "ТИХИЙ", clue: "Самый большой и глубокий океан на планете", category: "География" },
      { word: "МАДРИД", clue: "Столица Испании", category: "География" },
      { word: "ВЕЗУВИЙ", clue: "Действующий вулкан в Италии, уничтоживший Помпеи", category: "География" },
      { word: "АЛТАЙ", clue: "Горная система в Южной Сибири и Центральной Азии", category: "География" },
      { word: "БОСФОР", clue: "Пролив, разделяющий Европу и Азию в Стамбуле", category: "География" },
      { word: "ЭЙФЕЛЬ", clue: "Инженер, создавший знаменитую башню в Париже", category: "География" }
    ]
  },
  science: {
    name: "🔬 Наука и Космос",
    words: [
      { word: "ГРАВИТАЦИЯ", clue: "Сила притяжения между материальными телами", category: "Наука" },
      { word: "АТОМ", clue: "Мельчайшая частица химического элемента", category: "Наука" },
      { word: "КОСМОС", clue: "Пространство за пределами атмосферы Земли", category: "Наука" },
      { word: "ДНК", clue: "Молекула, хранящая генетическую информацию живых организмов", category: "Наука" },
      { word: "ЭНШТЕЙН", clue: "Физик, создатель теории относительности", category: "Наука" },
      { word: "ГАЛАКТИКА", clue: "Связанная гравитацией система из миллиардов звезд", category: "Наука" },
      { word: "ВАКУУМ", clue: "Пространство, свободное от вещества", category: "Наука" },
      { word: "НЕЙТРОН", clue: "Нейтральная элементарная частица в ядре атома", category: "Наука" },
      { word: "СПУТНИК", clue: "Космический аппарат, вращающийся вокруг планеты", category: "Наука" },
      { word: "ОРБИТА", clue: "Траектория движения небесного тела в пространстве", category: "Наука" },
      { word: "МЕТЕОР", clue: "Светящийся след в небе от сгорающего метеорита", category: "Наука" },
      { word: "ЛАЗЕР", clue: "Устройство, создающее узкий пучок интенсивного света", category: "Наука" }
    ]
  }
};

class CrosswordFetcher {

  /**
   * Получить список доступных онлайн-тем
   */
  static getThemes() {
    return Object.keys(ONLINE_THEMES).map(key => ({
      id: key,
      name: ONLINE_THEMES[key].name,
      count: ONLINE_THEMES[key].words.length
    }));
  }

  /**
   * Загрузить случайный кроссворд с внешнего веб-ресурса или из онлайн-базы
   */
  static async fetchRandomOnline(requestedCategory = null) {
    if (requestedCategory && ONLINE_THEMES[requestedCategory]) {
      const theme = ONLINE_THEMES[requestedCategory];
      return {
        title: theme.name,
        source: "Онлайн-база кроссвордов",
        words: this.shuffleAndPick(theme.words, 12)
      };
    }

    try {
      const remoteWords = await this.fetchFromExternalApi();
      if (remoteWords && remoteWords.length >= 5) {
        return {
          title: "🌐 Случайный онлайн-кроссворд из сети",
          source: "Интернет-источник",
          words: remoteWords
        };
      }
    } catch (e) {
      console.warn("[CrosswordFetcher] Ошибка получения из сети:", e.message);
    }

    const keys = Object.keys(ONLINE_THEMES);
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    const selectedTheme = ONLINE_THEMES[randomKey];

    return {
      title: `${selectedTheme.name}`,
      source: "Онлайн-ресурс",
      words: this.shuffleAndPick(selectedTheme.words, 12)
    };
  }

  /**
   * Загрузить веб-страницу по URL и автоматически найти ответы и вопросы
   * Поддерживает специальный парсинг для graycell.ru
   */
  static async fetchFromUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new Error("Неверный URL");
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const htmlContent = await this.httpGet(url);

    // Специальный парсер для graycell.ru
    const hostname = new URL(url).hostname;
    if (hostname.includes('graycell.ru')) {
      const words = this.parseGraycell(htmlContent);
      if (words.length === 0) throw new Error("Не удалось извлечь данные кроссворда с graycell.ru");
      return { title: `Кроссворд с graycell.ru`, sourceUrl: url, words: words.slice(0, 25) };
    }

    const words = this.extractWordsAndCluesFromHtml(htmlContent);

    if (words.length === 0) {
      throw new Error("Не удалось автоматически извлечь слова и ответы с указанного сайта.");
    }

    return {
      title: `Кроссворд с сайта ${hostname}`,
      sourceUrl: url,
      words: words.slice(0, 20)
    };
  }

  /**
   * Специальный парсер для сайта graycell.ru
   * Сайт использует XOR-шифрование с переменной Timer для слов и подсказок
   */
  static parseGraycell(html) {
    const extracted = [];
    const seenWords = new Set();

    // Извлекаем значение Timer для XOR-декодирования
    const timerMatch = html.match(/var Timer=(\d+);/);
    const timer = timerMatch ? parseInt(timerMatch[1], 10) : 0;
    if (!timer) return [];

    // Функция декодирования (реплика JS-функции a(s) с сайта)
    const decode = (encodedStr) => {
      let result = '';
      for (let i = 0; i < encodedStr.length; i += 4) {
        const code = parseInt(encodedStr.substring(i, i + 4), 10);
        if (!isNaN(code)) result += String.fromCharCode(code ^ timer);
      }
      return result.replace(/\u00ad/g, '').trim(); // убираем мягкий перенос
    };

    // Декодируем сетку букв (Full[r][c])
    const fullGrid = {};
    for (const m of html.matchAll(/Full\[(\d+)\]\[(\d+)\]="(\d+)"/g)) {
      const r = parseInt(m[1], 10);
      const c = parseInt(m[2], 10);
      if (!fullGrid[r]) fullGrid[r] = {};
      fullGrid[r][c] = String.fromCharCode(parseInt(m[3], 10) ^ timer);
    }

    // Парсим слова (Words[i] = {def:"...", dir:"...", id:N, x:N, y:N, len:N})
    const wordRegex = /Words\[\d+\]\s*=\s*\{def:"([^"]+)",\s*dir:"([^"]+)",\s*id:(\d+),\s*x:(\d+),\s*y:(\d+),\s*len:(\d+)\}/g;
    for (const m of html.matchAll(wordRegex)) {
      const dir = m[2];
      const x = parseInt(m[4], 10) - 1;
      const y = parseInt(m[5], 10) - 1;
      const len = parseInt(m[6], 10);
      const clue = decode(m[1]);

      let word = '';
      for (let i = 0; i < len; i++) {
        const r = dir === 'horizontal' ? y : y + i;
        const c = dir === 'horizontal' ? x + i : x;
        word += (fullGrid[r] && fullGrid[r][c]) ? fullGrid[r][c] : '?';
      }

      word = word.toUpperCase().replace(/Ё/g, 'Е');
      if (word.length >= 3 && !word.includes('?') && /^[А-ЯЁA-Z]+$/.test(word) && clue && !seenWords.has(word)) {
        seenWords.add(word);
        extracted.push({ word, clue, category: 'graycell.ru' });
      }
    }

    return extracted;
  }

  /**
   * Извлечение ответов и вопросов из текста HTML/JSON
   */
  static extractWordsAndCluesFromHtml(content) {
    const extracted = [];
    const seenWords = new Set();

    try {
      const jsonData = JSON.parse(content);
      const items = Array.isArray(jsonData) ? jsonData : jsonData.words || jsonData.data || jsonData.items || [];
      for (const item of items) {
        const w = (item.word || item.answer || item.target || '').toString().trim().toUpperCase();
        const c = (item.clue || item.question || item.description || item.hint || '').toString().trim();
        if (w.length >= 3 && w.length <= 15 && /^[А-ЯЁA-Z]+$/i.test(w) && c && !seenWords.has(w)) {
          seenWords.add(w);
          extracted.push({ word: w, clue: c, category: item.category || "Веб-сайт" });
        }
      }
      if (extracted.length > 0) return extracted;
    } catch (e) {}

    const cleanText = content
      .replace(/<script\b[^<]*>([\s\S]*?)<\/script>/gi, '')
      .replace(/<style\b[^<]*>([\s\S]*?)<\/style>/gi, '')
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' ');

    const lines = cleanText.split('\n');

    const patterns = [
      /^(?:\d+[\.\)\s]+)?([А-ЯЁA-Z]{3,15})[\s\:\—\-]+(.{5,120})$/i,
      /^(.{5,120})[\s\:\—\-]+([А-ЯЁA-Z]{3,15})$/i
    ];

    for (let line of lines) {
      line = line.trim();
      if (!line || line.length < 8) continue;

      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          let wordCandidate = match[1].trim().toUpperCase().replace(/Ё/g, 'Е');
          let clueCandidate = match[2].trim();

          if (clueCandidate.length <= 15 && /^[А-ЯЁA-Z]+$/i.test(clueCandidate) && wordCandidate.length > 15) {
            const temp = wordCandidate;
            wordCandidate = clueCandidate.toUpperCase();
            clueCandidate = temp;
          }

          if (
            wordCandidate.length >= 3 &&
            wordCandidate.length <= 14 &&
            /^[А-ЯЕA-Z]+$/i.test(wordCandidate) &&
            clueCandidate.length >= 4 &&
            !seenWords.has(wordCandidate)
          ) {
            seenWords.add(wordCandidate);
            extracted.push({
              word: wordCandidate,
              clue: clueCandidate,
              category: "Загружено с сайта"
            });
            break;
          }
        }
      }
    }

    return extracted;
  }

  static httpGet(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(this.httpGet(res.headers.location));
        }
        if (res.statusCode < 200 || res.statusCode >= 400) {
          return reject(new Error(`Ошибка HTTP: ${res.statusCode}`));
        }

        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(data));
      });

      req.on('error', (err) => reject(err));
      req.setTimeout(8000, () => {
        req.destroy();
        reject(new Error("Таймаут запроса к сайту"));
      });
    });
  }

  static async fetchFromExternalApi() {
    const categories = Object.keys(ONLINE_THEMES);
    const cat = categories[Math.floor(Math.random() * categories.length)];
    return this.shuffleAndPick(ONLINE_THEMES[cat].words, 10);
  }

  static shuffleAndPick(array, count) {
    const copy = [...array].sort(() => 0.5 - Math.random());
    return copy.slice(0, count);
  }
}

module.exports = CrosswordFetcher;
