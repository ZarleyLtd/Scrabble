/**
 * Extract main word and cross-words formed by a placement.
 */

import { BOARD_SIZE, inBounds } from './board.mjs';
import { validatePlacement } from './placement.mjs';

/**
 * Apply placements onto a cloned board view for reading letters.
 * Cells: { letter, blank, locked, tentative? }
 */
export function boardWithPlacements(board, placements) {
  const next = board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
  for (const p of placements) {
    next[p.row][p.col] = {
      letter: String(p.letter).toUpperCase(),
      blank: !!p.blank,
      locked: false,
      tentative: true
    };
  }
  return next;
}

function letterAt(board, row, col) {
  const cell = board[row] && board[row][col];
  return cell ? cell.letter : null;
}

/**
 * Expand along a line through (row,col) in the given axis to get full word cells.
 * axis: 'row' means horizontal word; 'col' means vertical.
 */
export function expandWord(board, row, col, axis) {
  const cells = [];
  if (axis === 'row') {
    let c = col;
    while (c > 0 && letterAt(board, row, c - 1)) c--;
    while (c < BOARD_SIZE && letterAt(board, row, c)) {
      cells.push({ row, col: c, letter: letterAt(board, row, c), blank: !!(board[row][c] && board[row][c].blank), tentative: !!(board[row][c] && board[row][c].tentative) });
      c++;
    }
  } else {
    let r = row;
    while (r > 0 && letterAt(board, r - 1, col)) r--;
    while (r < BOARD_SIZE && letterAt(board, r, col)) {
      cells.push({ row: r, col, letter: letterAt(board, r, col), blank: !!(board[r][col] && board[r][col].blank), tentative: !!(board[r][col] && board[r][col].tentative) });
      r++;
    }
  }
  return cells;
}

/**
 * Words formed by this turn's placements.
 * Returns { ok, error?, words: [{ word, cells, axis }] }
 * Includes main line word (if length >= 2 OR single-letter play that forms crosses)
 * and every perpendicular cross-word of length >= 2 that includes a new tile.
 * Single-letter words are omitted unless they are the only play on an empty-adjacent sense —
 * Scrabble requires every word formed to be valid; 1-letter "words" are not scored as words
 * but a lone tile must form at least one word of length >= 2 (or be part of main).
 */
export function extractWords(board, placements) {
  const v = validatePlacement(board, placements);
  if (!v.ok) return { ok: false, error: v.error, words: [] };

  const merged = boardWithPlacements(board, placements);
  const mainAxis = v.direction; // 'row' | 'col'
  const crossAxis = mainAxis === 'row' ? 'col' : 'row';

  const words = [];
  const seen = new Set();

  function addWord(cells, axis) {
    if (cells.length < 2) return;
    const key = cells.map((c) => c.row + ',' + c.col).join('|') + ':' + axis;
    if (seen.has(key)) return;
    seen.add(key);
    words.push({
      word: cells.map((c) => c.letter).join(''),
      cells,
      axis
    });
  }

  // Main word through first placement
  const anchor = placements[0];
  addWord(expandWord(merged, anchor.row, anchor.col, mainAxis), mainAxis);

  // Cross words through each new tile
  for (const p of placements) {
    addWord(expandWord(merged, p.row, p.col, crossAxis), crossAxis);
  }

  // If only one tile and no word of length >= 2, illegal (unless somehow — never)
  if (!words.length) {
    // Single tile adjacent extending? expand both axes
    const h = expandWord(merged, anchor.row, anchor.col, 'row');
    const vWord = expandWord(merged, anchor.row, anchor.col, 'col');
    if (h.length >= 2) addWord(h, 'row');
    if (vWord.length >= 2) addWord(vWord, 'col');
  }

  if (!words.length) {
    return { ok: false, error: 'Play must form at least one word of two or more letters', words: [] };
  }

  return { ok: true, words, direction: mainAxis };
}

export { inBounds };
