const { getRandomWords, DICTIONARY } = require('./dictionary');

/**
 * Класс генератора кроссвордов.
 * Автоматически строит сетку с пересечениями слов.
 */
class CrosswordGenerator {
  constructor(gridSize = 23) {
    this.gridSize = gridSize;
  }

  generate(customWords = null, wordCount = 20) {
    const targetCount = customWords && customWords.length > 0 ? customWords.length : wordCount;
    const candidateWords = customWords && customWords.length > 0
      ? customWords
      : getRandomWords(Math.max(targetCount * 2, 20));

    // Сортируем слова по длине (сначала длинные) для лучшей плотности
    const pool = [...candidateWords].sort((a, b) => b.word.length - a.word.length);

    let grid = Array(this.gridSize).fill(null).map(() => Array(this.gridSize).fill(null));
    const placedWords = [];

    if (pool.length === 0) return null;

    // Размещаем первое слово в центре по горизонтали
    const firstObj = pool[0];
    const firstWord = firstObj.word.toUpperCase();
    const startRow = Math.floor(this.gridSize / 2);
    const startCol = Math.floor((this.gridSize - firstWord.length) / 2);

    for (let i = 0; i < firstWord.length; i++) {
      grid[startRow][startCol + i] = {
        char: firstWord[i],
        wordIds: []
      };
    }

    placedWords.push({
      id: 1,
      word: firstWord,
      clue: firstObj.clue,
      category: firstObj.category || "Общее",
      row: startRow,
      col: startCol,
      direction: "across", // 'across' (по горизонтали) или 'down' (по вертикали)
      solved: false,
      solvedBy: null
    });
    grid[startRow][startCol].wordIds.push(1);

    // Пытаемся разместить остальные слова
    for (let w = 1; w < pool.length; w++) {
      if (placedWords.length >= wordCount) break;

      const item = pool[w];
      const word = item.word.toUpperCase();

      let bestPlacement = null;

      // Ищем совпадения букв с уже размещенными словами
      for (const placed of placedWords) {
        for (let i = 0; i < word.length; i++) {
          const char = word[i];
          for (let j = 0; j < placed.word.length; j++) {
            if (placed.word[j] === char) {
              // Буква совпала. Вычисляем возможные координаты
              const intersectRow = placed.direction === "across" ? placed.row : placed.row + j;
              const intersectCol = placed.direction === "across" ? placed.col + j : placed.col;

              const newDir = placed.direction === "across" ? "down" : "across";
              const newRow = newDir === "down" ? intersectRow - i : intersectRow;
              const newCol = newDir === "across" ? intersectCol - i : intersectCol;

              if (this.canPlace(grid, word, newRow, newCol, newDir)) {
                bestPlacement = { row: newRow, col: newCol, direction: newDir, word, clue: item.clue, category: item.category };
                break;
              }
            }
          }
          if (bestPlacement) break;
        }
        if (bestPlacement) break;
      }

      if (bestPlacement) {
        const nextId = placedWords.length + 1;
        const { row, col, direction, clue, category } = bestPlacement;

        for (let k = 0; k < word.length; k++) {
          const r = direction === "down" ? row + k : row;
          const c = direction === "across" ? col + k : col;

          if (!grid[r][c]) {
            grid[r][c] = { char: word[k], wordIds: [] };
          }
          grid[r][c].wordIds.push(nextId);
        }

        placedWords.push({
          id: nextId,
          word,
          clue,
          category: category || "Общее",
          row,
          col,
          direction,
          solved: false,
          solvedBy: null
        });
      }
    }

    // Обрезаем пустые строки/столбцы вокруг кроссворда
    return this.cropAndNumberGrid(grid, placedWords);
  }

  canPlace(grid, word, row, col, direction) {
    const len = word.length;

    // Проверка границ сетки
    if (row < 1 || col < 1 || row + (direction === "down" ? len : 0) >= this.gridSize - 1 || col + (direction === "across" ? len : 0) >= this.gridSize - 1) {
      return false;
    }

    // Проверка ячеек сразу до и после слова
    const prevR = direction === "down" ? row - 1 : row;
    const prevC = direction === "across" ? col - 1 : col;
    const nextR = direction === "down" ? row + len : row;
    const nextC = direction === "across" ? col + len : col;

    if (grid[prevR][prevC] !== null || grid[nextR][nextC] !== null) {
      return false;
    }

    let intersections = 0;

    for (let i = 0; i < len; i++) {
      const r = direction === "down" ? row + i : row;
      const c = direction === "across" ? col + i : col;
      const cell = grid[r][c];

      if (cell !== null) {
        // Буква в ячейке должна совпасть
        if (cell.char !== word[i]) return false;
        intersections++;
      } else {
        // Соседние ячейки перпендикулярно не должны содержать буквы (чтобы слова не "слипались")
        if (direction === "across") {
          if (grid[r - 1][c] !== null || grid[r + 1][c] !== null) return false;
        } else {
          if (grid[r][c - 1] !== null || grid[r][c + 1] !== null) return false;
        }
      }
    }

    return intersections > 0;
  }

  cropAndNumberGrid(grid, words) {
    let minR = this.gridSize, maxR = 0, minC = this.gridSize, maxC = 0;

    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (grid[r][c] !== null) {
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
        }
      }
    }

    if (minR > maxR || minC > maxC) return null;

    const rows = maxR - minR + 1;
    const cols = maxC - minC + 1;
    const croppedGrid = Array(rows).fill(null).map(() => Array(cols).fill(null));

    // Смещаем координаты слов
    const finalWords = words.map((w, index) => {
      const newRow = w.row - minR;
      const newCol = w.col - minC;
      return {
        ...w,
        number: index + 1,
        row: newRow,
        col: newCol
      };
    });

    // Заполняем обрезанную сетку
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const cell = grid[r][c];
        if (cell) {
          croppedGrid[r - minR][c - minC] = {
            char: cell.char,
            revealed: false
          };
        }
      }
    }

    // Находим номера ячеек для отображения 1, 2, 3 в сетке
    const cellNumbers = {};
    finalWords.forEach(w => {
      const key = `${w.row},${w.col}`;
      if (!cellNumbers[key]) {
        cellNumbers[key] = w.number;
      }
    });

    return {
      rows,
      cols,
      grid: croppedGrid,
      cellNumbers,
      words: finalWords
    };
  }
}

module.exports = CrosswordGenerator;
