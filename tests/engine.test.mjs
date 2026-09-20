/**
 * Engine unit tests — run with: node --test tests/engine.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createEmptyBoard,
  createShuffledBag,
  TILE_COUNTS,
  validatePlacement,
  scoreTurn,
  applyEndgameAdjustment,
  shouldEndGame,
  CENTER,
  BOARD_SIZE,
  premiumAt,
  removeFromRack,
  refillRack,
  RACK_SIZE,
  BINGO_BONUS,
  findAutoPlaceSquare
} from '../shared/engine/index.mjs';

describe('tiles', () => {
  it('bag has 100 tiles', () => {
    const bag = createShuffledBag(() => 0.5);
    assert.equal(bag.length, 100);
    let sum = 0;
    for (const c of Object.values(TILE_COUNTS)) sum += c;
    assert.equal(sum, 100);
  });

  it('removeFromRack is multiset-aware', () => {
    assert.deepEqual(removeFromRack(['A', 'A', 'B'], ['A']), ['A', 'B']);
    assert.equal(removeFromRack(['A'], ['B']), null);
  });

  it('refillRack tops up to 7', () => {
    const { rack, bag } = refillRack(['A', 'B'], ['C', 'D', 'E', 'F', 'G', 'H', 'I']);
    assert.equal(rack.length, RACK_SIZE);
    assert.equal(bag.length, 2);
  });
});

describe('board premiums', () => {
  it('centre is double word', () => {
    assert.equal(premiumAt(CENTER, CENTER), 'DW');
  });

  it('corners are triple word', () => {
    assert.equal(premiumAt(0, 0), 'TW');
    assert.equal(premiumAt(0, 14), 'TW');
    assert.equal(premiumAt(14, 0), 'TW');
    assert.equal(premiumAt(14, 14), 'TW');
  });
});

describe('placement', () => {
  it('first move must cover centre', () => {
    const board = createEmptyBoard();
    const bad = validatePlacement(board, [
      { row: 0, col: 0, letter: 'A' },
      { row: 0, col: 1, letter: 'T' }
    ]);
    assert.equal(bad.ok, false);

    const good = validatePlacement(board, [
      { row: CENTER, col: CENTER, letter: 'A' },
      { row: CENTER, col: CENTER + 1, letter: 'T' }
    ]);
    assert.equal(good.ok, true);
  });

  it('rejects occupied and non-line placements', () => {
    const board = createEmptyBoard();
    board[CENTER][CENTER] = { letter: 'A', blank: false, locked: true };
    const occ = validatePlacement(board, [{ row: CENTER, col: CENTER, letter: 'B' }]);
    assert.equal(occ.ok, false);

    const diag = validatePlacement(board, [
      { row: CENTER, col: CENTER + 1, letter: 'B' },
      { row: CENTER + 1, col: CENTER + 2, letter: 'C' }
    ]);
    assert.equal(diag.ok, false);
  });
});

describe('scoring', () => {
  it('scores first word with centre DW', () => {
    const board = createEmptyBoard();
    // HE at centre: H on centre (DW), E to the right
    // H=4, E=1 → (4+1)*2 = 10
    const result = scoreTurn(board, [
      { row: CENTER, col: CENTER, letter: 'H' },
      { row: CENTER, col: CENTER + 1, letter: 'E' }
    ]);
    assert.equal(result.ok, true);
    assert.equal(result.total, 10);
    assert.equal(result.words.length, 1);
    assert.equal(result.words[0].word, 'HE');
  });

  it('scores cross-words and letter premiums on new tiles only', () => {
    const board = createEmptyBoard();
    board[CENTER][CENTER] = { letter: 'A', blank: false, locked: true };
    board[CENTER][CENTER + 1] = { letter: 'T', blank: false, locked: true };
    // Play S below T forming ATS vertically? Actually play S under A? 
    // Place S at centre+1, centre+1? Wait: place BE below — 
    // Place S at (CENTER+1, CENTER+1) under T → word "TS"? need adjacent.
    // Simpler: extend AT to ATE with E to the right of T
    const result = scoreTurn(board, [
      { row: CENTER, col: CENTER + 2, letter: 'E' }
    ]);
    assert.equal(result.ok, true);
    assert.equal(result.words[0].word, 'ATE');
    // A=1,T=1,E=1 no new premiums on E at (7,9) — premiumAt(7,9)?
    // col 9 is not a special on row 7 typically. total 3
    assert.equal(result.total, 3);
  });

  it('applies bingo bonus for 7 tiles', () => {
    const board = createEmptyBoard();
    const placements = [];
    for (let i = 0; i < 7; i++) {
      placements.push({ row: CENTER, col: CENTER - 3 + i, letter: 'A' });
    }
    const result = scoreTurn(board, placements);
    assert.equal(result.ok, true);
    assert.equal(result.bingo, true);
    assert.ok(result.total >= BINGO_BONUS);
  });

  it('blank tiles score zero', () => {
    const board = createEmptyBoard();
    const result = scoreTurn(board, [
      { row: CENTER, col: CENTER, letter: 'Q', blank: true },
      { row: CENTER, col: CENTER + 1, letter: 'I' }
    ]);
    assert.equal(result.ok, true);
    // Q blank=0, I=1, DW on centre → 1*2=2
    assert.equal(result.total, 2);
  });
});

describe('endgame', () => {
  it('finisher gains others remaining values', () => {
    const players = [
      { seat: 0, rack: [], score: 100 },
      { seat: 1, rack: ['A', 'B'], score: 80 } // A1+B3=4
    ];
    const { adjustments, players: next } = applyEndgameAdjustment(players, 0);
    const fin = adjustments.find((a) => a.seat === 0);
    const other = adjustments.find((a) => a.seat === 1);
    assert.equal(fin.delta, 4);
    assert.equal(other.delta, -4);
    assert.equal(next[0].score, 104);
    assert.equal(next[1].score, 76);
  });

  it('shouldEndGame on full pass round', () => {
    const r = shouldEndGame({
      players: [
        { seat: 0, rack: 'ABC', resigned: false },
        { seat: 1, rack: 'DEF', resigned: false }
      ],
      bag: ['Z'],
      consecutivePasses: 2,
      consecutivePassesToEnd: 1
    });
    assert.equal(r.end, true);
    assert.equal(r.reason, 'passes');
  });

  it('does not end merely because another player has an empty rack', () => {
    const r = shouldEndGame({
      players: [
        { seat: 0, rack: 'ABC', resigned: false },
        { seat: 1, rack: '', resigned: false }
      ],
      consecutivePasses: 0,
      consecutivePassesToEnd: 1
    });
    assert.equal(r.end, false);
  });

  it('ends when playedOutSeat emptied their rack', () => {
    const r = shouldEndGame({
      players: [
        { seat: 0, rack: '', resigned: false },
        { seat: 1, rack: 'ABC', resigned: false }
      ],
      consecutivePasses: 0,
      playedOutSeat: 0
    });
    assert.equal(r.end, true);
    assert.equal(r.reason, 'played_out');
    assert.equal(r.finisherSeat, 0);
  });
});

describe('board size', () => {
  it('is 15x15', () => {
    const b = createEmptyBoard();
    assert.equal(b.length, BOARD_SIZE);
    assert.equal(b[0].length, BOARD_SIZE);
  });
});

describe('auto-place', () => {
  it('prefers right of the first tile, else below', () => {
    const board = createEmptyBoard();
    const one = [{ row: CENTER, col: CENTER, letter: 'A' }];
    assert.deepEqual(findAutoPlaceSquare(board, one), {
      row: CENTER,
      col: CENTER + 1
    });
    board[CENTER][CENTER + 1] = { letter: 'X', blank: false, locked: true };
    assert.deepEqual(findAutoPlaceSquare(board, one), {
      row: CENTER + 1,
      col: CENTER
    });
  });

  it('picks nearest legal square to the last tile', () => {
    const board = createEmptyBoard();
    const placements = [
      { row: CENTER, col: CENTER, letter: 'A' },
      { row: CENTER, col: CENTER + 1, letter: 'B' }
    ];
    assert.deepEqual(findAutoPlaceSquare(board, placements), {
      row: CENTER,
      col: CENTER + 2
    });
  });

  it('targets the centre on an empty board with no placements', () => {
    assert.deepEqual(findAutoPlaceSquare(createEmptyBoard(), []), {
      row: CENTER,
      col: CENTER
    });
  });

  it('returns null with no placements once the board has tiles', () => {
    const board = createEmptyBoard();
    board[CENTER][CENTER] = { letter: 'A', blank: false, locked: true };
    assert.equal(findAutoPlaceSquare(board, []), null);
  });
});
