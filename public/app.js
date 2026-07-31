/**
 * Frontend JavaScript для Twitch Extension Оверлея Кроссворда
 */

let socket = null;
let currentGameState = null;
let activeTab = 'grid'; // 'grid' | 'clues' | 'leaderboard'
let leaderboardSubTab = 'round'; // 'round' | 'allTime'
let isVisible = true;
let lastProcessedActivityId = null;
let lastRoundId = null;

document.addEventListener('DOMContentLoaded', () => {
  initUIState();
  fetchInitialState();
  connectWebSocket();

  // Инициализация официального Twitch Extension Helper SDK
  if (window.Twitch && window.Twitch.ext) {
    window.Twitch.ext.onAuthorized(async (auth) => {
      console.log('[Twitch Ext] Авторизован на канале ID:', auth.channelId);
      if (auth && auth.channelId && auth.token) {
        try {
          const clientId = auth.clientId || '4mr6i16vvtfztb40tkhnpkgeo06i5c';
          const r = await fetch(`https://api.twitch.tv/helix/users?id=${auth.channelId}`, {
            headers: {
              'Client-ID': clientId,
              'Authorization': 'Extension ' + auth.token
            }
          });
          if (r.ok) {
            const data = await r.json();
            if (data.data && data.data[0] && data.data[0].login) {
              const detectedLogin = data.data[0].login.toLowerCase();
              console.log('[Twitch Ext] Точно определён логин канала:', detectedLogin);
              localStorage.setItem('cw_channel', detectedLogin);
              if (socket && socket.readyState === WebSocket.OPEN) {
                connectWebSocket();
              }
            }
          }
        } catch (e) {
          console.warn('[Twitch Ext] Ошибка определения имени через Helix:', e);
        }
      }
      fetchInitialState();
    });

    window.Twitch.ext.onContext((context) => {
      console.log('[Twitch Ext] Контекст видеоплеера:', context);
    });
  }
});

async function fetchInitialState() {
  const host = getBackendHost();
  const channel = getChannel();
  const isSecure = window.location.protocol === 'https:' || host.includes('trycloudflare.com') || host.includes('railway.app');
  const protocol = isSecure ? 'https:' : 'http:';
  const apiUrl = `${protocol}//${host}/api/state?channel=${encodeURIComponent(channel)}`;

  try {
    const res = await fetch(apiUrl);
    if (res.ok) {
      const data = await res.json();
      if (data && data.gameData) {
        onStateUpdate(data);
      } else {
        const createRes = await fetch(`${protocol}//${host}/api/new-game`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, wordCount: 10 })
        });
        if (createRes.ok) {
          const freshState = await fetch(apiUrl).then(r => r.json());
          onStateUpdate(freshState);
        }
      }
    }
  } catch (err) {
    console.warn('[Extension] Ошибка HTTP начальной загрузки:', err);
  }
}

async function requestNewGame() {
  const host = getBackendHost();
  const channel = getChannel();
  const isSecure = window.location.protocol === 'https:' || host.includes('trycloudflare.com') || host.includes('railway.app');
  const protocol = isSecure ? 'https:' : 'http:';
  
  const connText = document.getElementById('connStatusText');
  if (connText) connText.textContent = 'Генерация кроссворда...';

  try {
    await fetch(`${protocol}//${host}/api/new-game`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, wordCount: 10 })
    });
  } catch (e) {
    console.error('Ошибка запроса новой игры:', e);
  }
}

let currentZoom = 100;

// Загрузка состояния видимости оверлея и инициализация кнопок
function initUIState() {
  const savedState = localStorage.getItem('twitch_crossword_visible');
  
  if (savedState !== null) {
    isVisible = savedState === 'true';
  }

  updateVisibilityUI();
  initZoomControls();

  const toggleBtn = document.getElementById('toggleBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      isVisible = !isVisible;
      localStorage.setItem('twitch_crossword_visible', isVisible);
      updateVisibilityUI();
    });
  }

  // Табы
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      tabBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeTab = e.target.getAttribute('data-tab');
      renderActiveTab();
    });
  });
}

function initZoomControls() {
  const savedZoom = localStorage.getItem('cw_grid_zoom');
  if (savedZoom) {
    currentZoom = parseInt(savedZoom, 10) || 100;
  }
  applyZoom();

  const outBtn = document.getElementById('zoomOutBtn');
  const inBtn = document.getElementById('zoomInBtn');
  const resetBtn = document.getElementById('zoomResetBtn');

  if (outBtn) {
    outBtn.addEventListener('click', () => {
      if (currentZoom > 60) {
        currentZoom -= 15;
        applyZoom();
      }
    });
  }

  if (inBtn) {
    inBtn.addEventListener('click', () => {
      if (currentZoom < 180) {
        currentZoom += 15;
        applyZoom();
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      currentZoom = 100;
      applyZoom();
    });
  }
}

function applyZoom() {
  const zoomVal = document.getElementById('zoomVal');
  if (zoomVal) zoomVal.textContent = `${currentZoom}%`;

  localStorage.setItem('cw_grid_zoom', currentZoom);

  const baseSize = 28;
  const newSize = Math.round((baseSize * currentZoom) / 100);
  const newFont = Math.max(9, Math.round((13 * currentZoom) / 100));
  const newNumFont = Math.max(6, Math.round((8 * currentZoom) / 100));

  document.documentElement.style.setProperty('--grid-cell-size', `${newSize}px`);
  document.documentElement.style.setProperty('--grid-cell-font', `${newFont}px`);
  document.documentElement.style.setProperty('--grid-num-font', `${newNumFont}px`);

  const gridEl = document.querySelector('.crossword-grid');
  if (gridEl && currentGameState && currentGameState.gameData) {
    gridEl.style.gridTemplateColumns = `repeat(${currentGameState.gameData.cols}, ${newSize}px)`;
    gridEl.style.gridTemplateRows = `repeat(${currentGameState.gameData.rows}, ${newSize}px)`;
  }
}

function updateVisibilityUI() {
  const container = document.getElementById('extensionContainer');
  const toggleBtnText = document.getElementById('toggleBtnText');

  if (container) {
    if (isVisible) {
      container.classList.remove('hidden');
      if (toggleBtnText) toggleBtnText.textContent = 'Скрыть кроссворд';
    } else {
      container.classList.add('hidden');
      if (toggleBtnText) toggleBtnText.textContent = 'Показать кроссворд';
    }
  }
}

// Извлечение имени текущего канала
function getChannel() {
  const urlParams = new URLSearchParams(window.location.search);
  const fromQuery = urlParams.get('channel') || urlParams.get('channel_name') || urlParams.get('login');
  if (fromQuery) return fromQuery.toLowerCase().replace('#', '').trim();

  const saved = localStorage.getItem('cw_channel');
  if (saved) return saved.toLowerCase().replace('#', '').trim();

  return 'cptponos';
}

const DEFAULT_BACKEND_HOST = 'attention-examples-neutral-visits.trycloudflare.com';

// Определяем хост сервера расширения
function getBackendHost() {
  const host = window.location.host;
  // 1. Если загружено с сервера туннеля — window.location.host всегда 100% точный актуальный адрес
  if (host && !host.includes('twitch.tv') && !host.includes('ext-twitch')) {
    localStorage.setItem('cw_backend_host', host);
    return host;
  }

  // 2. Если внутри Twitch CDN iframe — проверяем URL параметр backend
  const urlParams = new URLSearchParams(window.location.search);
  const fromQuery = urlParams.get('backend') || urlParams.get('server');
  if (fromQuery) return fromQuery.replace(/^https?:\/\//, '');

  const savedHost = localStorage.getItem('cw_backend_host');
  if (savedHost && !savedHost.includes('twitch.tv') && !savedHost.includes('ext-twitch')) {
    return savedHost;
  }

  return DEFAULT_BACKEND_HOST;
}

let pingInterval = null;

// Подключение по WebSocket к серверу расширения для конкретного канала
function connectWebSocket() {
  if (socket) {
    try { socket.close(); } catch (e) {}
  }
  if (pingInterval) clearInterval(pingInterval);

  const host = getBackendHost();
  const channel = getChannel();
  const isSecure = window.location.protocol === 'https:' || host.includes('railway.app') || host.includes('trycloudflare.com');
  const protocol = isSecure ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${host}/ws?channel=${encodeURIComponent(channel)}`;

  console.log(`[Extension] Подключение к WebSocket (${channel}):`, wsUrl);

  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('[Extension] Соединение с сервером установлено');
    const connText = document.getElementById('connStatusText');
    if (connText) connText.textContent = 'Загрузка сетки кроссворда...';
    
    // Периодический PING раз в 15 секунд для поддержания активности Cloudflare туннеля
    pingInterval = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'PING' }));
      }
    }, 15000);
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'STATE_UPDATE') {
        onStateUpdate(msg.data);
      }
    } catch (e) {
      console.error('[Extension] Ошибка парсинга WS:', e);
    }
  };

  socket.onclose = () => {
    if (pingInterval) clearInterval(pingInterval);
    console.warn('[Extension] Соединение закрыто. Переподключение через 2 сек...');
    const connText = document.getElementById('connStatusText');
    if (connText) connText.textContent = 'Переподключение к серверу...';
    setTimeout(() => {
      fetchInitialState();
      connectWebSocket();
    }, 2000);
  };

  socket.onerror = (err) => {
    console.error('[Extension] Ошибка соединения WS:', err);
  };
}

function onStateUpdate(newState) {
  const isNewRound = lastRoundId !== null && (lastRoundId !== newState.currentRound || (newState.gameData && newState.gameData.title !== (currentGameState && currentGameState.gameData && currentGameState.gameData.title)));
  
  currentGameState = newState;
  lastRoundId = newState.currentRound;

  if (isNewRound) {
    showToast('✨ Запущен новый кроссворд!', 'info');
  }

  // Проверяем последние события для отображения уведомлений (верно / неверно)
  if (newState.recentActivity && newState.recentActivity.length > 0) {
    const latest = newState.recentActivity[0];
    if (latest && latest.id !== lastProcessedActivityId) {
      lastProcessedActivityId = latest.id;
      if (latest.type === 'success') {
        showToast(latest.text, 'success');
      } else if (latest.type === 'error') {
        showToast(latest.text, 'error');
      }
    }
  }

  // Обновление прогресс-бара и бейджей
  updateHeader();
  renderActiveTab();
}

function updateHeader() {
  if (!currentGameState) return;

  const percent = currentGameState.stats ? (currentGameState.stats.progressPercent || 0) : 0;
  const fill = document.getElementById('progressFill');
  const badge = document.getElementById('progressBadge');

  if (fill) fill.style.width = `${percent}%`;
  if (badge) badge.textContent = `${percent}%`;
}

function renderActiveTab() {
  const body = document.getElementById('extensionBody');
  if (!body || !currentGameState || !currentGameState.gameData) return;

  body.innerHTML = '';

  if (activeTab === 'grid') {
    renderGridView(body);
  } else if (activeTab === 'clues') {
    renderCluesView(body);
  } else if (activeTab === 'leaderboard') {
    renderLeaderboardView(body);
  }
}

// Рендер сетки кроссворда
function renderGridView(container) {
  const { rows, cols, grid, cellNumbers, words } = currentGameState.gameData;

  const wrapper = document.createElement('div');
  wrapper.className = 'crossword-grid-wrapper';

  const baseSize = 28;
  const newSize = Math.round((baseSize * currentZoom) / 100);

  const gridEl = document.createElement('div');
  gridEl.className = 'crossword-grid';
  gridEl.style.gridTemplateColumns = `repeat(${cols}, ${newSize}px)`;
  gridEl.style.gridTemplateRows = `repeat(${rows}, ${newSize}px)`;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellData = grid[r][c];
      const cellEl = document.createElement('div');
      cellEl.dataset.row = r;
      cellEl.dataset.col = c;

      if (!cellData) {
        cellEl.className = 'grid-cell empty';
      } else {
        cellEl.className = `grid-cell ${cellData.revealed ? 'revealed' : ''}`;
        
        // Номер первой буквы слова
        const numKey = `${r},${c}`;
        if (cellNumbers[numKey]) {
          const numEl = document.createElement('span');
          numEl.className = 'cell-number';
          numEl.textContent = cellNumbers[numKey];
          cellEl.appendChild(numEl);
        }

        if (cellData.revealed) {
          const charNode = document.createTextNode(cellData.char);
          cellEl.appendChild(charNode);
        }
      }

      gridEl.appendChild(cellEl);
    }
  }

  wrapper.appendChild(gridEl);
  container.appendChild(wrapper);

  // Компактный список активных вопросов под сеткой
  const quickClues = document.createElement('div');
  quickClues.className = 'clues-container';
  quickClues.style.marginTop = '10px';

  const title = document.createElement('div');
  title.className = 'clue-group-title';
  title.innerHTML = `<span>📝 Неразгаданные вопросы (${currentGameState.stats.totalWords - currentGameState.stats.solvedWords})</span>`;
  quickClues.appendChild(title);

  const list = document.createElement('div');
  list.className = 'clue-list';

  words.forEach(w => {
    if (!w.solved) {
      const item = createClueElement(w);
      list.appendChild(item);
    }
  });

  quickClues.appendChild(list);
  container.appendChild(quickClues);
}

// Рендер подробного списка вопросов
function renderCluesView(container) {
  const { words } = currentGameState.gameData;
  const cluesBox = document.createElement('div');
  cluesBox.className = 'clues-container';

  const acrossWords = words.filter(w => w.direction === 'across');
  const downWords = words.filter(w => w.direction === 'down');

  if (acrossWords.length > 0) {
    const titleA = document.createElement('div');
    titleA.className = 'clue-group-title';
    titleA.innerHTML = `<span>➡️ По горизонтали</span>`;
    cluesBox.appendChild(titleA);

    const listA = document.createElement('div');
    listA.className = 'clue-list';
    acrossWords.forEach(w => listA.appendChild(createClueElement(w)));
    cluesBox.appendChild(listA);
  }

  if (downWords.length > 0) {
    const titleD = document.createElement('div');
    titleD.className = 'clue-group-title';
    titleD.style.marginTop = '12px';
    titleD.innerHTML = `<span>⬇️ По вертикали</span>`;
    cluesBox.appendChild(titleD);

    const listD = document.createElement('div');
    listD.className = 'clue-list';
    downWords.forEach(w => listD.appendChild(createClueElement(w)));
    cluesBox.appendChild(listD);
  }

  container.appendChild(cluesBox);
}

function createClueElement(wordObj) {
  const item = document.createElement('div');
  item.className = `clue-item ${wordObj.solved ? 'solved' : ''}`;

  item.innerHTML = `
    <div>
      <span class="clue-num">#${wordObj.number}</span>
      <span class="clue-text">${wordObj.clue}</span>
      <span style="color: rgba(255,255,255,0.4); font-size: 10px;">(${wordObj.word.length} букв)</span>
    </div>
    ${wordObj.solved ? `<div class="solver-badge">✓ Отгадал: @${wordObj.solvedBy}</div>` : ''}
  `;

  item.addEventListener('mouseenter', () => highlightWordInGrid(wordObj, true));
  item.addEventListener('mouseleave', () => highlightWordInGrid(wordObj, false));

  return item;
}

function highlightWordInGrid(wordObj, highlight) {
  const { row, col, direction, word } = wordObj;

  for (let i = 0; i < word.length; i++) {
    const r = direction === 'down' ? row + i : row;
    const c = direction === 'across' ? col + i : col;
    const cellEl = document.querySelector(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
    if (cellEl) {
      if (highlight) cellEl.classList.add('highlighted');
      else cellEl.classList.remove('highlighted');
    }
  }
}

// Рендер таблицы лидеров зрителей с суб-вкладками (Раунд / За всё время)
function renderLeaderboardView(container) {
  // Навигация суб-вкладок (За раунд / За всё время)
  const subNav = document.createElement('div');
  subNav.className = 'subtab-navigation';

  const btnRound = document.createElement('button');
  btnRound.className = `subtab-btn ${leaderboardSubTab === 'round' ? 'active' : ''}`;
  btnRound.textContent = '🏆 Этот раунд';
  btnRound.addEventListener('click', () => {
    leaderboardSubTab = 'round';
    renderLeaderboardView(container);
  });

  const btnAllTime = document.createElement('button');
  btnAllTime.className = `subtab-btn ${leaderboardSubTab === 'allTime' ? 'active' : ''}`;
  btnAllTime.textContent = '⭐ За всё время';
  btnAllTime.addEventListener('click', () => {
    leaderboardSubTab = 'allTime';
    renderLeaderboardView(container);
  });

  subNav.appendChild(btnRound);
  subNav.appendChild(btnAllTime);

  container.innerHTML = '';
  container.appendChild(subNav);

  const box = document.createElement('div');
  box.className = 'leaderboard-list';

  const dataSource = leaderboardSubTab === 'allTime' 
    ? (currentGameState.allTimeLeaderboard || {})
    : (currentGameState.leaderboard || {});

  const entries = Object.entries(dataSource)
    .map(([username, data]) => ({ username, ...data }))
    .sort((a, b) => b.points - a.points);

  if (entries.length === 0) {
    const emptyMsg = leaderboardSubTab === 'allTime'
      ? 'Пока нет сохраненных рекордов за все время.'
      : 'Пока никто не отгадал слова в этом раунде.<br>Напишите ответ в чат!';
    box.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted); font-size: 13px;">${emptyMsg}</div>`;
    container.appendChild(box);
    return;
  }

  entries.forEach((item, index) => {
    const el = document.createElement('div');
    el.className = 'leaderboard-item';

    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;

    el.innerHTML = `
      <div class="leader-rank">${medal}</div>
      <div class="leader-name">@${item.username}</div>
      <div style="font-size: 11px; color: var(--text-muted); margin-right: 10px;">${item.solvedCount} слов</div>
      <div class="leader-score">${item.points} pt</div>
    `;
    box.appendChild(el);
  });

  container.appendChild(box);
}

// Всплывающее уведомление (Успех / Ошибка)
function showToast(text, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast-notification ${type === 'error' ? 'error' : ''}`;
  toast.textContent = text;
  document.body.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 4000);
}
