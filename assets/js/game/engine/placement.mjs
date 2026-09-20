/**
 * Placement legality for a proposed set of tiles in one turn.
 * Placements: [{ row, col, letter, blank? }]
 * letter is A–Z (the letter shown); blank true if tile was '?'.
 */

import {
  BOARD_SIZE,
  CENTER,
  boardIsEmpty,
  inBounds,
  isOccupied
} from './board.mjs';

/**
 * Validate placements against board (committed tiles only) and within-turn rules.
 * Returns { ok: true, direction: 'row'|'col', sorted } or { ok: false, error }.
 */
export function validatePlacement(board, placements) {
  if (!placements || !placements.length) {
    return { ok: false, error: 'Place at least one tile' };
  }

  const seen = new Set();
  for (const p of placements) {
    if (!inBounds(p.row, p.col)) {
      return { ok: false, error: 'Tile out of bounds' };
    }
    const key = p.row + ',' + p.col;
    if (seen.has(key)) return { ok: false, error: 'Duplicate square in placement' };
    seen.add(key);
    if (isOccupied(board, p.row, p.col)) {
      return { ok: false, error: 'Square already occupied' };
    }
    const letter = String(p.letter || '').toUpperCase();
    if (!/^[A-Z]$/.test(letter)) {
      return { ok: false, error: 'Invalid letter' };
    }
  }

  const rows = [...new Set(placements.map((p) => p.row))];
  const cols = [...new Set(placements.map((p) => p.col))];
  let direction;
  if (rows.length === 1) direction = 'row';
  else if (cols.length === 1) direction = 'col';
  else {
    return { ok: false, error: 'Tiles must be in a single row or column' };
  }

  const sorted = placements.slice().sort((a, b) =>
    direction === 'row' ? a.col - b.col : a.row - b.row
  );

  // Contiguity: every square between first and last must be filled by new tile OR existing board tile
  if (direction === 'row') {
    const r = sorted[0].row;
    const minC = sorted[0].col;
    const maxC = sorted[sorted.length - 1].col;
    const newCols = new Set(sorted.map((p) => p.col));
    for (let c = minC; c <= maxC; c++) {
      if (!newCols.has(c) && !isOccupied(board, r, c)) {
        return { ok: false, error: 'Tiles must be contiguous (no gaps)' };
      }
    }
  } else {
    const c = sorted[0].col;
    const minR = sorted[0].row;
    const maxR = sorted[sorted.length - 1].row;
    const newRows = new Set(sorted.map((p) => p.row));
    for (let r = minR; r <= maxR; r++) {
      if (!newRows.has(r) && !isOccupied(board, r, c)) {
        return { ok: false, error: 'Tiles must be contiguous (no gaps)' };
      }
    }
  }

  const empty = boardIsEmpty(board);
  if (empty) {
    const coversCenter = placements.some((p) => p.row === CENTER && p.col === CENTER);
    if (!coversCenter) {
      return { ok: false, error: 'First word must cover the centre star' };
    }
  } else {
    // At least one new tile adjacent (orthogonally) to an existing locked tile
    const touches = placements.some((p) => hasAdjacentOccupied(board, p.row, p.col));
    if (!touches) {
      return { ok: false, error: 'Word must touch an existing tile' };
    }
  }

  return { ok: true, direction, sorted };
}

function hasAdjacentOccupied(board, row, col) {
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  for (const [dr, dc] of dirs) {
    const r = row + dr;
    const c = col + dc;
    if (inBounds(r, c) && isOccupied(board, r, c)) return true;
  }
  return false;
}

/**
 * A span on a row [c0..c1] or column [r0..r1] connects to the board if it
 * contains an occupied square (intersects) or any square in the span is
 * orthogonally adjacent to an occupied square (adjacent play / hook).
 */
function spanConnectsToBoard(board, fixed, lo, hi, axis) {
  for (let i = lo; i <= hi; i++) {
    const r = axis === 'row' ? fixed : i;
    const c = axis === 'row' ? i : fixed;
    if (isOccupied(board, r, c)) return true;
    if (hasAdjacentOccupied(board, r, c)) return true;
  }
  return false;
}

/**
 * True if empty square (row,col) could belong to some play of at most `rackCount`
 * new tiles in a straight line that intersects or is adjacent to existing tiles.
 *
 * A candidate span must include (row,col), contain 1..rackCount empty squares
 * (all of which would receive new tiles), and connect to the board.
 */
function canBePartOfConnectingPlay(board, row, col, rackCount) {
  const n = Math.max(0, Number(rackCount) || 0);
  if (n < 1) return false;

  // Horizontal spans on this row
  for (let c0 = 0; c0 <= col; c0++) {
    for (let c1 = col; c1 < BOARD_SIZE; c1++) {
      let empties = 0;
      for (let c = c0; c <= c1; c++) {
        if (!isOccupied(board, row, c)) empties += 1;
      }
      if (empties < 1 || empties > n) continue;
      if (spanConnectsToBoard(board, row, c0, c1, 'row')) return true;
    }
  }

  // Vertical spans on this column
  for (let r0 = 0; r0 <= row; r0++) {
    for (let r1 = row; r1 < BOARD_SIZE; r1++) {
      let empties = 0;
      for (let r = r0; r <= r1; r++) {
        if (!isOccupied(board, r, col)) empties += 1;
      }
      if (empties < 1 || empties > n) continue;
      if (spanConnectsToBoard(board, col, r0, r1, 'col')) return true;
    }
  }

  return false;
}

/**
 * Whether a single empty square is a legal target given current tentative placements
 * (same turn), for UI highlighting. Does not require contiguity of final word yet.
 *
 * For the first tile of a turn on a non-empty board: any empty square that could be
 * part of a word using at most `rackCount` new tiles that intersects or is adjacent
 * to existing board tiles. `rackCount` is tiles available this turn (rack length,
 * plus tentative tiles when relocating the opening tile).
 */
export function isSquareSelectable(board, placements, row, col, rackCount = 7) {
  if (!inBounds(row, col) || isOccupied(board, row, col)) return false;
  if (placements.some((p) => p.row === row && p.col === col)) return false;
  if (!placements.length) {
    if (boardIsEmpty(board)) return true; // any empty; Done will require centre
    return canBePartOfConnectingPlay(board, row, col, rackCount);
  }
  const rows = placements.map((p) => p.row);
  const cols = placements.map((p) => p.col);
  const sameRow = rows.every((r) => r === rows[0]);
  const sameCol = cols.every((c) => c === cols[0]);
  if (sameRow && row === rows[0]) return true;
  if (sameCol && col === cols[0]) return true;
  if (sameRow && sameCol) {
    // single tile placed: allow same row or same col
    return row === rows[0] || col === cols[0];
  }
  return false;
}

/**
 * Target square for rack double-click / auto-place.
 * - No placements yet on an empty board: centre star.
 * - With placements: prefer right then below of the last tile when legal; else
 *   nearest legal square (Manhattan), ties prefer right, below, left, up.
 * Returns { row, col } or null.
 */
export function findAutoPlaceSquare(board, placements, rackCount = 7) {
  if (!placements || !placements.length) {
    if (boardIsEmpty(board)) return { row: CENTER, col: CENTER };
    return null;
  }

  function free(row, col) {
    return isSquareSelectable(board, placements, row, col, rackCount);
  }

  if (placements.length === 1) {
    const p = placements[0];
    if (free(p.row, p.col + 1)) return { row: p.row, col: p.col + 1 };
    if (free(p.row + 1, p.col)) return { row: p.row + 1, col: p.col };
  }

  const last = placements[placements.length - 1];
  let best = null;
  let bestDist = Infinity;

  function directionRank(row, col) {
    const dr = row - last.row;
    const dc = col - last.col;
    const dist = Math.abs(dr) + Math.abs(dc);
    if (dc === dist && dr === 0) return 0; // right
    if (dr === dist && dc === 0) return 1; // below
    if (dc === -dist && dr === 0) return 2; // left
    if (dr === -dist && dc === 0) return 3; // up
    return 4;
  }

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!free(r, c)) continue;
      const dist = Math.abs(r - last.row) + Math.abs(c - last.col);
      if (dist < bestDist) {
        bestDist = dist;
        best = { row: r, col: c };
      } else if (dist === bestDist && best && directionRank(r, c) < directionRank(best.row, best.col)) {
        best = { row: r, col: c };
      }
    }
  }
  return best;
}

export { BOARD_SIZE, CENTER };
