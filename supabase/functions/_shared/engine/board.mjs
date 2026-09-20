/**
 * Standard Scrabble 15×15 board: premium squares and empty board factory.
 */

export const BOARD_SIZE = 15;
export const CENTER = 7;

/** Premium types */
export const PREMIUM = Object.freeze({
  NONE: null,
  DL: 'DL', // double letter
  TL: 'TL', // triple letter
  DW: 'DW', // double word
  TW: 'TW'  // triple word
});

/**
 * Symmetric premium layout (standard English Scrabble).
 * Only one quadrant is listed; mirrored to all four.
 */
const QUADRANT_PREMIUMS = [
  // [row, col, type] — 0-based, upper-left including center line
  [0, 0, 'TW'], [0, 3, 'DL'], [0, 7, 'TW'],
  [1, 1, 'DW'], [1, 5, 'TL'],
  [2, 2, 'DW'], [2, 6, 'DL'],
  [3, 0, 'DL'], [3, 3, 'DW'], [3, 7, 'DL'],
  [4, 4, 'DW'],
  [5, 1, 'TL'], [5, 5, 'TL'],
  [6, 2, 'DL'], [6, 6, 'DL'],
  [7, 0, 'TW'], [7, 3, 'DL']
  // center [7,7] is DW (star) — applied separately
];

function mirrorPremiums() {
  const map = new Map();
  const set = (r, c, t) => map.set(r + ',' + c, t);
  for (const [r, c, t] of QUADRANT_PREMIUMS) {
    set(r, c, t);
    set(r, BOARD_SIZE - 1 - c, t);
    set(BOARD_SIZE - 1 - r, c, t);
    set(BOARD_SIZE - 1 - r, BOARD_SIZE - 1 - c, t);
    set(c, r, t);
    set(c, BOARD_SIZE - 1 - r, t);
    set(BOARD_SIZE - 1 - c, r, t);
    set(BOARD_SIZE - 1 - c, BOARD_SIZE - 1 - r, t);
  }
  set(CENTER, CENTER, 'DW');
  return map;
}

const PREMIUM_MAP = mirrorPremiums();

export function premiumAt(row, col) {
  return PREMIUM_MAP.get(row + ',' + col) || null;
}

/**
 * Cell: null | { letter, blank, locked }
 * letter: A–Z (assigned letter even for blanks)
 * blank: boolean
 * locked: boolean — true once turn is committed
 */
export function createEmptyBoard() {
  const board = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row = [];
    for (let c = 0; c < BOARD_SIZE; c++) row.push(null);
    board.push(row);
  }
  return board;
}

export function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function inBounds(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function isOccupied(board, row, col) {
  return !!(board[row] && board[row][col]);
}

export function boardIsEmpty(board) {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c]) return false;
    }
  }
  return true;
}

/** Flatten board to JSON-friendly 225-length array or keep 2D — we use 2D. */
export function serializeBoard(board) {
  return cloneBoard(board);
}

export function deserializeBoard(data) {
  if (!data) return createEmptyBoard();
  if (Array.isArray(data) && data.length === BOARD_SIZE) return cloneBoard(data);
  return createEmptyBoard();
}
