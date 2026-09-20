/**
 * Score words formed by a turn. Premiums apply only to newly placed tiles' squares.
 */

import { premiumAt } from './board.mjs';
import { BINGO_BONUS, RACK_SIZE, tileValue } from './tiles.mjs';
import { extractWords } from './words.mjs';

/**
 * Score a single word given its cells and the set of newly covered squares.
 * cells: [{ row, col, letter, blank }]
 * newKeys: Set of "r,c" for this turn's placements
 */
export function scoreWord(cells, newKeys) {
  let letterSum = 0;
  let wordMult = 1;
  for (const cell of cells) {
    const key = cell.row + ',' + cell.col;
    const isNew = newKeys.has(key);
    const prem = isNew ? premiumAt(cell.row, cell.col) : null;
    let lv = tileValue(cell.letter, !!cell.blank);
    if (isNew && prem === 'DL') lv *= 2;
    if (isNew && prem === 'TL') lv *= 3;
    letterSum += lv;
    if (isNew && prem === 'DW') wordMult *= 2;
    if (isNew && prem === 'TW') wordMult *= 3;
  }
  return letterSum * wordMult;
}

/**
 * Full turn score.
 * Returns { ok, error?, total, words: [{ word, score, cells, axis }], bingo }
 */
export function scoreTurn(board, placements) {
  const extracted = extractWords(board, placements);
  if (!extracted.ok) {
    return { ok: false, error: extracted.error, total: 0, words: [], bingo: false };
  }

  const newKeys = new Set(placements.map((p) => p.row + ',' + p.col));
  const scoredWords = extracted.words.map((w) => ({
    word: w.word,
    axis: w.axis,
    cells: w.cells,
    score: scoreWord(w.cells, newKeys)
  }));

  let total = scoredWords.reduce((s, w) => s + w.score, 0);
  const bingo = placements.length >= RACK_SIZE;
  if (bingo) total += BINGO_BONUS;

  return { ok: true, total, words: scoredWords, bingo };
}
