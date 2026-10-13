/**
 * Header countdown under the turn label: turn remaining / player bank remaining.
 * Also refreshes per-player {bank} spans in the Scores list.
 */

import {
  TURN_WARNING_MS,
  remainingMs,
  remainingWithSkew,
  remainingMsWithSkew,
  formatClockMs
} from '../game/engine/timer.mjs';

function remainingForDeadline(endsAt, snapshot, frozen, receivedAt) {
  if (!endsAt) return null;
  if (frozen) return remainingMs(endsAt, snapshot.serverNow);
  return remainingWithSkew(endsAt, snapshot.serverNow, Date.now(), receivedAt);
}

function remainingForBank(bankMs, snapshot, frozen, receivedAt, ticking) {
  if (bankMs == null || !Number.isFinite(Number(bankMs))) return null;
  if (frozen || !ticking) return Math.max(0, Number(bankMs));
  return remainingMsWithSkew(Number(bankMs), snapshot.serverNow, Date.now(), receivedAt);
}

function paintTurnClock(el, turnMs, bankMs, warn, showTurn, showBank) {
  if (!el) return;
  if (!showTurn && !showBank) {
    el.textContent = '';
    el.classList.add('hidden');
    el.classList.remove('header-clock--warn');
    return;
  }
  var turnText = showTurn && turnMs != null ? formatClockMs(turnMs) : '—';
  var bankText = showBank && bankMs != null ? formatClockMs(bankMs) : '—';
  el.classList.remove('hidden');
  el.classList.toggle('header-clock--warn', !!warn);
  el.textContent = turnText + ' / ' + bankText;
}

function currentPlayer(snapshot) {
  if (!snapshot || !snapshot.players) return null;
  return snapshot.players.find(function (p) {
    return Number(p.seat) === Number(snapshot.currentSeat);
  });
}

function snapshotKey(snapshot) {
  if (!snapshot) return '';
  return [
    String(snapshot.turnEndsAt || ''),
    String(snapshot.currentSeat),
    String(snapshot.status),
    String(snapshot.turnPaused),
    String(snapshot.serverNow || '')
  ].join('|');
}

function paintScoreBanks(scoresEl, snapshot, frozen, receivedAt) {
  if (!scoresEl || !snapshot) return;
  var showBank = Number(snapshot.gameLimitMinutes) > 0;
  var nodes = scoresEl.querySelectorAll('[data-bank-seat]');
  if (!nodes.length) return;
  var players = snapshot.players || [];
  nodes.forEach(function (el) {
    if (!showBank) {
      el.textContent = '';
      el.classList.add('hidden');
      return;
    }
    var seat = Number(el.getAttribute('data-bank-seat'));
    var p = players.find(function (x) {
      return Number(x.seat) === seat;
    });
    if (!p || p.bankRemainingMs == null) {
      el.textContent = '';
      el.classList.add('hidden');
      return;
    }
    var ticking =
      !frozen &&
      snapshot.status === 'active' &&
      !snapshot.turnPaused &&
      Number(p.seat) === Number(snapshot.currentSeat);
    var ms = remainingForBank(p.bankRemainingMs, snapshot, frozen, receivedAt, ticking);
    el.classList.remove('hidden');
    el.textContent = '{' + formatClockMs(ms) + '}';
  });
}

export function createGameClocks(els, options) {
  var opts = options || {};
  var turnEl = els && els.turnEl;
  var scoresEl = els && els.scoresEl;
  var snapshot = null;
  var timer = null;
  var expireNotified = false;
  var receivedAt = 0;
  var lastKey = '';

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function paint() {
    if (!snapshot) {
      paintTurnClock(turnEl, null, null, false, false, false);
      return;
    }
    var frozen = snapshot.status === 'finished';
    var showTurn = Number(snapshot.turnLimitMinutes) > 0;
    var showBank = Number(snapshot.gameLimitMinutes) > 0;
    var turnMs =
      showTurn && snapshot.turnEndsAt
        ? remainingForDeadline(snapshot.turnEndsAt, snapshot, frozen, receivedAt)
        : showTurn
          ? null
          : null;
    var cur = currentPlayer(snapshot);
    var bankTicking =
      showBank &&
      !frozen &&
      snapshot.status === 'active' &&
      !snapshot.turnPaused &&
      cur != null;
    var bankMs = showBank
      ? remainingForBank(
          cur && cur.bankRemainingMs,
          snapshot,
          frozen,
          receivedAt,
          bankTicking
        )
      : null;
    var warn = !frozen && turnMs != null && turnMs <= TURN_WARNING_MS;
    paintTurnClock(turnEl, turnMs, bankMs, warn, showTurn, showBank);
    paintScoreBanks(scoresEl || document.getElementById('scores'), snapshot, frozen, receivedAt);

    if (
      !frozen &&
      !expireNotified &&
      ((turnMs != null && turnMs <= 0 && showTurn) ||
        (bankMs != null && bankMs <= 0 && showBank && bankTicking))
    ) {
      expireNotified = true;
      if (typeof opts.onExpire === 'function') opts.onExpire();
    }
  }

  function start() {
    stop();
    if (!snapshot || snapshot.status === 'finished') return;
    var hasClock =
      (Number(snapshot.turnLimitMinutes) > 0 && snapshot.turnEndsAt) ||
      Number(snapshot.gameLimitMinutes) > 0;
    if (!hasClock) return;
    timer = setInterval(paint, 250);
  }

  return {
    update: function (next) {
      var nextKey = snapshotKey(next);
      if (!next) {
        receivedAt = 0;
        lastKey = '';
      } else if (nextKey !== lastKey || !snapshot) {
        receivedAt = Date.now();
      }
      if (nextKey !== lastKey) expireNotified = false;
      lastKey = nextKey;
      snapshot = next || null;
      if (next && els && !scoresEl) {
        scoresEl = els.scoresEl || document.getElementById('scores');
      }
      paint();
      start();
    },
    destroy: function () {
      stop();
      snapshot = null;
      lastKey = '';
      paintTurnClock(turnEl, null, null, false, false, false);
    }
  };
}

/** HTML for the score column: thin {bank} left of the total. */
export function scoreTotalHtml(player, showBank) {
  var score =
    '<span class="score-value">' +
    (player && player.score != null ? player.score : 0) +
    '</span>';
  if (!showBank) {
    return '<span class="score-total score-total--plain">' + score + '</span>';
  }
  var bankText =
    player && player.bankRemainingMs != null
      ? '{' + formatClockMs(player.bankRemainingMs) + '}'
      : '';
  return (
    '<span class="score-total">' +
    '<span class="score-bank" data-bank-seat="' +
    Number(player.seat) +
    '">' +
    bankText +
    '</span>' +
    score +
    '</span>'
  );
}
