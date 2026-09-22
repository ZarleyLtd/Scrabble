/**
 * Local (single-browser) multiplayer game controller — no network.
 */

import {
  createEmptyBoard,
  createShuffledBag,
  refillRack,
  exchangeTiles,
  RACK_SIZE,
  BLANK
} from '../game/engine/index.mjs';
import { validatePlacement, isSquareSelectable } from '../game/engine/placement.mjs';
import { scoreTurn } from '../game/engine/scoring.mjs';
import { applyEndgameAdjustment, shouldEndGame } from '../game/engine/endgame.mjs';

function uid() {
  return 'p_' + Math.random().toString(36).slice(2, 10);
}

export function createLocalGame(options) {
  var playerCount = Math.max(2, Math.min(4, options.playerCount || 2));
  var names = options.names || [];
  var challenges = options.challengesPerPlayer != null ? options.challengesPerPlayer : 2;
  var consecutivePassesToEnd =
    options.consecutivePassesToEnd != null ? options.consecutivePassesToEnd : 1;

  var bag = createShuffledBag();
  var players = [];
  for (var i = 0; i < playerCount; i++) {
    players.push({
      id: uid(),
      seat: i,
      name: names[i] || 'Player ' + (i + 1),
      rack: [],
      score: 0,
      challengesLeft: challenges,
      resigned: false
    });
  }
  for (var d = 0; d < players.length; d++) {
    var dealt = refillRack(players[d].rack, bag, RACK_SIZE);
    players[d].rack = dealt.rack;
    bag = dealt.bag;
  }

  var state = {
    status: 'active',
    board: createEmptyBoard(),
    bag: bag,
    players: players,
    currentSeat: 0,
    turnNumber: 1,
    consecutivePasses: 0,
    consecutivePassesToEnd: consecutivePassesToEnd,
    placements: [],
    selectedRackIndex: null,
    selectedBoard: null,
    exchangeMode: false,
    exchangeSelected: {},
    moves: [],
    challengeableMoveIndex: null,
    pendingFinisherSeat: null,
    version: 1,
    endReason: null
  };

  function currentPlayer() {
    return state.players.find(function (p) {
      return p.seat === state.currentSeat;
    });
  }

  function nextSeat(from) {
    var seat = from;
    for (var n = 0; n < state.players.length; n++) {
      seat = (seat + 1) % state.players.length;
      var p = state.players.find(function (x) {
        return x.seat === seat;
      });
      if (p && !p.resigned) return seat;
    }
    return from;
  }

  function bump() {
    state.version += 1;
  }

  function finalWordError() {
    if (state.pendingFinisherSeat != null) return 'The final word can still be challenged';
    return null;
  }

  function finishIfNeeded(playedOutSeat) {
    var check = shouldEndGame({
      players: state.players,
      bag: state.bag,
      consecutivePasses: state.consecutivePasses,
      consecutivePassesToEnd: state.consecutivePassesToEnd,
      playedOutSeat: playedOutSeat != null ? playedOutSeat : null
    });
    if (!check.end) return;
    var adj = applyEndgameAdjustment(state.players, check.finisherSeat);
    state.players = adj.players;
    state.status = 'finished';
    state.endReason = check.reason;
    state.challengeableMoveIndex = null;
    state.moves.push({
      type: 'endgame_adjust',
      adjustments: adj.adjustments,
      reason: check.reason
    });
    bump();
  }

  function advanceTurn() {
    state.placements = [];
    state.selectedRackIndex = null;
    state.selectedBoard = null;
    state.exchangeMode = false;
    state.exchangeSelected = {};
    state.currentSeat = nextSeat(state.currentSeat);
    state.turnNumber += 1;
  }

  function clearSelection() {
    state.selectedRackIndex = null;
    state.selectedBoard = null;
  }

  function lineOk(trial) {
    if (trial.length <= 1) return true;
    var rows = {};
    var cols = {};
    trial.forEach(function (p) {
      rows[p.row] = true;
      cols[p.col] = true;
    });
    return Object.keys(rows).length === 1 || Object.keys(cols).length === 1;
  }

  return {
    getState: function () {
      return state;
    },

    selectRackTile: function (index) {
      if (state.status !== 'active') return { error: 'Game over' };
      var p = currentPlayer();
      if (p.resigned) return { error: 'You have resigned' };
      if (!p || index < 0 || index >= p.rack.length) return { error: 'Invalid tile' };

      if (state.exchangeMode) {
        if (state.exchangeSelected[index]) delete state.exchangeSelected[index];
        else state.exchangeSelected[index] = true;
        return { ok: true };
      }

      state.selectedRackIndex = index;
      state.selectedBoard = null;
      return { ok: true };
    },

    selectBoardTile: function (row, col) {
      if (state.status !== 'active') return { error: 'Game over' };
      if (state.exchangeMode) return { error: 'Exit exchange mode first' };
      var found = state.placements.some(function (p) {
        return p.row === row && p.col === col;
      });
      if (!found) return { error: 'Only tiles played this turn can be selected' };
      state.selectedBoard = { row: row, col: col };
      state.selectedRackIndex = null;
      return { ok: true };
    },

    reorderRack: function (fromIndex, toIndex) {
      if (state.status !== 'active') return { error: 'Game over' };
      var p = currentPlayer();
      if (!p || p.resigned) return { error: 'You have resigned' };
      if (state.exchangeMode) return { error: 'Exit exchange mode first' };
      if (fromIndex === toIndex) return { ok: true };
      if (fromIndex < 0 || fromIndex >= p.rack.length) return { error: 'Invalid tile' };
      if (toIndex < 0 || toIndex >= p.rack.length) return { error: 'Invalid position' };
      var tile = p.rack.splice(fromIndex, 1)[0];
      p.rack.splice(toIndex, 0, tile);
      state.selectedRackIndex = toIndex;
      state.selectedBoard = null;
      return { ok: true };
    },

    toggleExchangeMode: function () {
      var blocked = finalWordError();
      if (blocked) return { error: blocked };
      state.exchangeMode = !state.exchangeMode;
      state.exchangeSelected = {};
      clearSelection();
      return { ok: true, exchangeMode: state.exchangeMode };
    },

    placeOnBoard: function (row, col, rackIndexOpt) {
      if (state.status !== 'active') return { error: 'Game over' };
      var blocked = finalWordError();
      if (blocked) return { error: blocked };
      var p = currentPlayer();
      if (p.resigned) return { error: 'You have resigned' };
      if (state.exchangeMode) return { error: 'Exit exchange mode first' };
      if (rackIndexOpt != null) state.selectedRackIndex = rackIndexOpt;
      if (state.selectedRackIndex == null) return { error: 'Select a tile first' };
      if (state.board[row][col]) return { error: 'Square already occupied' };
      if (
        state.placements.some(function (x) {
          return x.row === row && x.col === col;
        })
      ) {
        return { error: 'Square already has a tile this turn' };
      }

      if (
        !state.placements.length &&
        !isSquareSelectable(state.board, [], row, col, p.rack.length)
      ) {
        return { error: 'Square too far from existing tiles' };
      }

      var letter = p.rack[state.selectedRackIndex];
      if (letter == null) return { error: 'Select a tile first' };

      var placement = {
        row: row,
        col: col,
        letter: letter === BLANK ? null : letter,
        blank: letter === BLANK,
        fromRack: letter
      };

      var trial = state.placements.concat([
        {
          row: row,
          col: col,
          letter: letter === BLANK ? 'A' : letter,
          blank: letter === BLANK
        }
      ]);
      if (!lineOk(trial)) {
        return { error: 'Tiles must be in a single row or column' };
      }

      if (letter === BLANK) {
        return { needBlank: true, pending: placement, rackIndex: state.selectedRackIndex };
      }

      p.rack.splice(state.selectedRackIndex, 1);
      state.placements.push({
        row: row,
        col: col,
        letter: letter,
        blank: false,
        fromRack: letter
      });
      clearSelection();
      return { ok: true };
    },

    movePlacement: function (fromRow, fromCol, toRow, toCol) {
      if (state.status !== 'active') return { error: 'Game over' };
      if (state.exchangeMode) return { error: 'Exit exchange mode first' };
      if (fromRow === toRow && fromCol === toCol) return { ok: true };
      if (state.board[toRow][toCol]) return { error: 'Square already occupied' };
      var idx = state.placements.findIndex(function (p) {
        return p.row === fromRow && p.col === fromCol;
      });
      if (idx < 0) return { error: 'Nothing to move' };
      if (
        state.placements.some(function (p) {
          return p.row === toRow && p.col === toCol;
        })
      ) {
        return { error: 'Square already has a tile this turn' };
      }

      var others = state.placements.filter(function (_, i) {
        return i !== idx;
      });
      var moving = state.placements[idx];
      var p = currentPlayer();
      var reach = (p && p.rack ? p.rack.length : 0) + state.placements.length;
      if (!others.length && !isSquareSelectable(state.board, [], toRow, toCol, reach)) {
        return { error: 'Square too far from existing tiles' };
      }
      var trial = others.concat([
        {
          row: toRow,
          col: toCol,
          letter: moving.letter,
          blank: !!moving.blank
        }
      ]);
      if (!lineOk(trial)) {
        return { error: 'Tiles must be in a single row or column' };
      }

      state.placements[idx] = {
        row: toRow,
        col: toCol,
        letter: moving.letter,
        blank: !!moving.blank,
        fromRack: moving.fromRack
      };
      state.selectedBoard = { row: toRow, col: toCol };
      state.selectedRackIndex = null;
      return { ok: true };
    },

    confirmBlank: function (pending, rackIndex, letter) {
      var p = currentPlayer();
      if (state.board[pending.row][pending.col]) return { error: 'Square already occupied' };
      if (p.rack[rackIndex] !== BLANK) return { error: 'Blank no longer selected' };
      p.rack.splice(rackIndex, 1);
      state.placements.push({
        row: pending.row,
        col: pending.col,
        letter: String(letter).toUpperCase(),
        blank: true,
        fromRack: BLANK
      });
      clearSelection();
      return { ok: true };
    },

    recallPlacement: function (row, col, insertIndex) {
      var idx = state.placements.findIndex(function (p) {
        return p.row === row && p.col === col;
      });
      if (idx < 0) return { error: 'Nothing to recall' };
      var pl = state.placements.splice(idx, 1)[0];
      var p = currentPlayer();
      var tile = pl.fromRack != null ? pl.fromRack : pl.blank ? BLANK : pl.letter;
      if (insertIndex == null || insertIndex < 0 || insertIndex > p.rack.length) {
        p.rack.push(tile);
        state.selectedRackIndex = p.rack.length - 1;
      } else {
        p.rack.splice(insertIndex, 0, tile);
        state.selectedRackIndex = insertIndex;
      }
      state.selectedBoard = null;
      return { ok: true };
    },

    recallAll: function () {
      var p = currentPlayer();
      state.placements.forEach(function (pl) {
        p.rack.push(pl.fromRack != null ? pl.fromRack : pl.blank ? BLANK : pl.letter);
      });
      state.placements = [];
      clearSelection();
      return { ok: true };
    },

    drawTiles: function () {
      if (state.status !== 'active') return { error: 'Game over' };
      var p = currentPlayer();
      if (state.placements.length) return { error: 'Recall tiles before drawing' };
      var result = refillRack(p.rack, state.bag, RACK_SIZE);
      p.rack = result.rack;
      state.bag = result.bag;
      bump();
      return { ok: true, drawn: result.drawn };
    },

    previewScore: function () {
      if (!state.placements.length) return null;
      var r = scoreTurn(state.board, state.placements);
      return r.ok ? r : { error: r.error };
    },

    commitMove: function () {
      if (state.status !== 'active') return { error: 'Game over' };
      var blocked = finalWordError();
      if (blocked) return { error: blocked };
      var p = currentPlayer();
      var scored = scoreTurn(state.board, state.placements);
      if (!scored.ok) return { error: scored.error };

      var rackBefore = p.rack
        .concat(
          state.placements.map(function (pl) {
            return pl.fromRack != null ? pl.fromRack : pl.blank ? BLANK : pl.letter;
          })
        )
        .join('');

      state.placements.forEach(function (pl) {
        state.board[pl.row][pl.col] = {
          letter: pl.letter,
          blank: !!pl.blank,
          locked: true
        };
      });

      p.score += scored.total;
      state.consecutivePasses = 0;

      var move = {
        type: 'play',
        seat: p.seat,
        name: p.name,
        placements: state.placements.map(function (pl) {
          return { row: pl.row, col: pl.col, letter: pl.letter, blank: !!pl.blank };
        }),
        words: scored.words.map(function (w) {
          return { word: w.word, score: w.score };
        }),
        score: scored.total,
        bingo: scored.bingo,
        rackBefore: rackBefore
      };
      state.moves.push(move);
      state.challengeableMoveIndex = state.moves.length - 1;
      state.placements = [];
      clearSelection();

      // Refill rack from the bag (same as "Get Letter Tiles")
      var refill = refillRack(p.rack, state.bag, RACK_SIZE);
      p.rack = refill.rack;
      state.bag = refill.bag;
      move.drawn = (refill.drawn || []).join('');

      // Gone out only if rack is still empty after refill (bag was empty).
      // Keep the play challengeable until someone ends the game or a challenge fails.
      if (p.rack.length === 0) {
        state.pendingFinisherSeat = p.seat;
        advanceTurn();
      } else {
        finishIfNeeded(null);
        if (state.status === 'active') advanceTurn();
      }
      bump();
      return { ok: true, move: move, drawn: refill.drawn };
    },

    pass: function () {
      if (state.status !== 'active') return { error: 'Game over' };
      var blocked = finalWordError();
      if (blocked) return { error: blocked };
      if (state.placements.length) this.recallAll();
      var p = currentPlayer();
      state.consecutivePasses += 1;
      state.challengeableMoveIndex = null;
      state.moves.push({ type: 'pass', seat: p.seat, name: p.name });
      finishIfNeeded(null);
      if (state.status === 'active') advanceTurn();
      bump();
      return { ok: true };
    },

    confirmExchange: function () {
      if (state.status !== 'active') return { error: 'Game over' };
      var blockedExchange = finalWordError();
      if (blockedExchange) return { error: blockedExchange };
      if (state.placements.length) return { error: 'Recall tiles first' };
      var p = currentPlayer();
      var indices = Object.keys(state.exchangeSelected)
        .map(Number)
        .sort(function (a, b) {
          return b - a;
        });
      if (!indices.length) return { error: 'Select tiles to exchange' };
      var selected = indices.map(function (i) {
        return p.rack[i];
      });
      var result = exchangeTiles(p.rack, state.bag, selected);
      if (result.error) return { error: result.error };
      p.rack = result.rack;
      state.bag = result.bag;
      // Exchange is a turn but does not count toward consecutive-pass game over
      state.challengeableMoveIndex = null;
      state.moves.push({ type: 'exchange', seat: p.seat, name: p.name, count: selected.length });
      state.exchangeMode = false;
      state.exchangeSelected = {};
      if (state.status === 'active') advanceTurn();
      bump();
      return { ok: true };
    },

    resign: function (seat) {
      var blockedResign = finalWordError();
      if (blockedResign) return { error: blockedResign };
      var p = state.players.find(function (x) {
        return x.seat === (seat != null ? seat : state.currentSeat);
      });
      if (!p || p.resigned) return { error: 'Already resigned' };
      if (state.placements.length && p.seat === state.currentSeat) this.recallAll();
      p.resigned = true;
      state.moves.push({ type: 'resign', seat: p.seat, name: p.name });
      state.challengeableMoveIndex = null;
      finishIfNeeded(null);
      if (state.status === 'active' && state.currentSeat === p.seat) advanceTurn();
      bump();
      return { ok: true };
    },

    challengeLocal: function (assumeInvalid) {
      if (state.challengeableMoveIndex == null) return { error: 'Nothing to challenge' };
      var move = state.moves[state.challengeableMoveIndex];
      if (!move || move.type !== 'play') return { error: 'Nothing to challenge' };

      var current = currentPlayer();
      if (!current || current.resigned) return { error: 'You have resigned' };
      if (current.seat === move.seat) return { error: 'Cannot challenge your own move' };
      if (!(current.challengesLeft > 0)) return { error: 'No challenges left' };
      var challenger = current;

      if (!assumeInvalid) {
        challenger.challengesLeft -= 1;
        move.challengeOutcome = 'failed';
        move.challengedByName = challenger.name;
        state.moves.push({
          type: 'challenge',
          outcome: 'failed',
          seat: challenger.seat,
          name: challenger.name,
          against: move.seat
        });
        if (state.pendingFinisherSeat != null) {
          var finisher = state.pendingFinisherSeat;
          state.pendingFinisherSeat = null;
          finishIfNeeded(finisher);
        }
        bump();
        return {
          ok: true,
          outcome: 'failed',
          challengerName: challenger.name,
          challengedName: move.name
        };
      }

      var mover = state.players.find(function (p) {
        return p.seat === move.seat;
      });
      var removedPlacements = (move.placements || []).map(function (pl) {
        return { row: pl.row, col: pl.col, letter: pl.letter, blank: !!pl.blank };
      });
      move.placements.forEach(function (pl) {
        state.board[pl.row][pl.col] = null;
      });
      mover.score -= move.score;
      // Return tiles drawn after the play to the bag, restore pre-play rack
      if (move.drawn) {
        state.bag = state.bag.concat(String(move.drawn).split('').filter(Boolean));
      }
      mover.rack = (move.rackBefore || '').split('').filter(Boolean);
      move.challengeOutcome = 'success';
      move.challengedByName = challenger.name;
      move.words = (move.words || []).map(function (w) {
        return {
          word: w.word,
          score: w.score,
          valid: false
        };
      });
      state.moves.push({
        type: 'challenge',
        outcome: 'success',
        seat: challenger.seat,
        name: challenger.name,
        against: move.seat
      });
      state.challengeableMoveIndex = null;
      state.pendingFinisherSeat = null;
      // Challenged player loses the turn; current seat stays on the next player
      bump();
      return {
        ok: true,
        outcome: 'success',
        placements: removedPlacements,
        challengerName: challenger.name,
        challengedName: move.name || (mover && mover.name) || ''
      };
    },

    endGame: function () {
      if (state.pendingFinisherSeat == null) return { error: 'Game is not waiting to end' };
      var current = currentPlayer();
      if (current && current.seat === state.pendingFinisherSeat) {
        return { error: 'You cannot end your own final word' };
      }
      var finisher = state.pendingFinisherSeat;
      state.pendingFinisherSeat = null;
      finishIfNeeded(finisher);
      return { ok: true };
    }
  };
}
