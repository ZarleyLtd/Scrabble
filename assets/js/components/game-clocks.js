/**
 * Header countdown clocks for turn and overall game time.
 * Turn clock sits under the status line; game clock under the game code.
 */

import {
  TURN_WARNING_MS,
  remainingMs,
  remainingWithSkew,
  formatClockMs
} from '../game/engine/timer.mjs';

function remainingFor(endsAt, snapshot, frozen, receivedAt) {
  if (!endsAt) return null;
  if (frozen) return remainingMs(endsAt, snapshot.serverNow);
  return remainingWithSkew(endsAt, snapshot.serverNow, Date.now(), receivedAt);
}

function paintClock(el, remaining, warn) {
  if (!el) return;
  if (remaining == null) {
    el.textContent = '';
    el.classList.add('hidden');
    el.classList.remove('header-clock--warn');
    return;
  }
  el.classList.remove('hidden');
  el.classList.toggle('header-clock--warn', !!warn);
  el.textContent = formatClockMs(remaining);
}

export function createGameClocks(els, options) {
  var opts = options || {};
  var turnEl = els && els.turnEl;
  var gameEl = els && els.gameEl;
  var snapshot = null;
  var timer = null;
  var expireNotified = false;
  var receivedAt = 0;

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function paint() {
    if (!snapshot) {
      paintClock(turnEl, null, false);
      paintClock(gameEl, null, false);
      return;
    }
    var frozen = snapshot.status === 'finished';
    var showTurn = Number(snapshot.turnLimitMinutes) > 0 && snapshot.turnEndsAt;
    var showGame = Number(snapshot.gameLimitMinutes) > 0 && snapshot.gameEndsAt;
    var turnMs = showTurn ? remainingFor(snapshot.turnEndsAt, snapshot, frozen, receivedAt) : null;
    var gameMs = showGame ? remainingFor(snapshot.gameEndsAt, snapshot, frozen, receivedAt) : null;
    var warn = !frozen && turnMs != null && turnMs <= TURN_WARNING_MS;
    paintClock(turnEl, turnMs, warn);
    paintClock(gameEl, gameMs, false);

    if (
      !frozen &&
      !expireNotified &&
      ((turnMs != null && turnMs <= 0) || (gameMs != null && gameMs <= 0))
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
      (Number(snapshot.gameLimitMinutes) > 0 && snapshot.gameEndsAt);
    if (!hasClock) return;
    timer = setInterval(paint, 250);
  }

  return {
    update: function (next) {
      var prevKey = snapshot
        ? String(snapshot.turnEndsAt) + '|' + String(snapshot.gameEndsAt) + '|' + String(snapshot.status)
        : '';
      var nextKey = next
        ? String(next.turnEndsAt) + '|' + String(next.gameEndsAt) + '|' + String(next.status)
        : '';
      snapshot = next || null;
      receivedAt = Date.now();
      if (prevKey !== nextKey) expireNotified = false;
      paint();
      start();
    },
    destroy: function () {
      stop();
      snapshot = null;
      paintClock(turnEl, null, false);
      paintClock(gameEl, null, false);
    }
  };
}
