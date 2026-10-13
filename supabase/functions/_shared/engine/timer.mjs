/**
 * Turn and game clock helpers. Limits are whole minutes; 0 means no limit.
 */

export const TURN_WARNING_MS = 30000;
export const MAX_TIMER_MINUTES = 999;

export function normalizeTimerLimits(input) {
  function n(value) {
    var x = Number(value);
    if (!Number.isFinite(x) || x < 0) return 0;
    return Math.min(MAX_TIMER_MINUTES, Math.floor(x));
  }
  if (input == null || typeof input !== 'object') {
    return { turnLimitMinutes: 0, gameLimitMinutes: 0 };
  }
  return {
    turnLimitMinutes: n(input.turnLimitMinutes),
    gameLimitMinutes: n(input.gameLimitMinutes)
  };
}

export function toEpochMs(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) {
    var t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  var parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function deadlineIso(startedAt, limitMinutes) {
  var start = toEpochMs(startedAt);
  var mins = Number(limitMinutes) || 0;
  if (start == null || mins <= 0) return null;
  return new Date(start + mins * 60 * 1000).toISOString();
}

export function remainingMs(endsAt, now) {
  var end = toEpochMs(endsAt);
  var t = toEpochMs(now);
  if (end == null || t == null) return null;
  return Math.max(0, end - t);
}

export function clockSkewOffset(serverNow, localNow) {
  var server = toEpochMs(serverNow);
  var local = toEpochMs(localNow != null ? localNow : Date.now());
  if (server == null || local == null) return 0;
  return local - server;
}

/**
 * Remaining ms at `localNow`, given remaining at `serverNow`.
 * `receivedAt` is the local time when `serverNow` was captured. If omitted,
 * remaining stays at the snapshot value (no countdown).
 */
export function remainingWithSkew(endsAt, serverNow, localNow, receivedAt) {
  var atSnapshot = remainingMs(endsAt, serverNow);
  if (atSnapshot == null) return null;
  var local = toEpochMs(localNow != null ? localNow : Date.now());
  var received = toEpochMs(receivedAt);
  if (local == null || received == null) return atSnapshot;
  return Math.max(0, atSnapshot - (local - received));
}

export function formatClockMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return '';
  var total = Math.max(0, Math.ceil(ms / 1000));
  var h = Math.floor(total / 3600);
  var m = Math.floor((total % 3600) / 60);
  var s = total % 60;
  var ss = String(s).padStart(2, '0');
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + ss;
  return m + ':' + ss;
}

export function formatTimerLimitsLabel(turnLimitMinutes, gameLimitMinutes) {
  var turn = Number(turnLimitMinutes) || 0;
  var game = Number(gameLimitMinutes) || 0;
  if (turn <= 0 && game <= 0) return 'No time limit';
  var turnPart = turn > 0 ? turn + ' min/turn' : 'No turn limit';
  var gamePart = game > 0 ? game + ' min game' : 'no game limit';
  return turnPart + ' · ' + gamePart;
}

/**
 * @returns {{ turnLimitMinutes: number, gameLimitMinutes: number, gameEndsAt: string|null, turnEndsAt: string|null, turnPaused: boolean }}
 */
export function computeTimerDeadlines(opts) {
  var o = opts || {};
  var limits = normalizeTimerLimits(o);
  var status = o.status;
  var pending = o.pendingFinisherSeat != null ? Number(o.pendingFinisherSeat) : null;
  var turnPaused = Number.isFinite(pending);
  var activeOrFinished = status === 'active' || status === 'finished';
  var gameEndsAt = activeOrFinished ? deadlineIso(o.gameStartedAt, limits.gameLimitMinutes) : null;
  var turnEndsAt =
    status === 'active' && !turnPaused ? deadlineIso(o.turnStartedAt, limits.turnLimitMinutes) : null;
  return {
    turnLimitMinutes: limits.turnLimitMinutes,
    gameLimitMinutes: limits.gameLimitMinutes,
    gameEndsAt: gameEndsAt,
    turnEndsAt: turnEndsAt,
    turnPaused: turnPaused
  };
}

/**
 * Game clock wins if both would fire. Turn clock does not expire during the final-word window.
 * @returns {'game'|'turn'|null}
 */
export function expiredTimerKind(opts, now) {
  var o = opts || {};
  if (o.status !== 'active') return null;
  var t = toEpochMs(now != null ? now : Date.now());
  if (t == null) return null;
  var gameEnd = toEpochMs(o.gameEndsAt);
  if (gameEnd != null && gameEnd <= t) return 'game';
  if (o.turnPaused || o.pendingFinisherSeat != null) return null;
  var turnEnd = toEpochMs(o.turnEndsAt);
  if (turnEnd != null && turnEnd <= t) return 'turn';
  return null;
}
