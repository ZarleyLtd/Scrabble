/**
 * Turn and per-player bank clock helpers. Limits are whole minutes; 0 means no limit.
 * gameLimitMinutes is each player's total bank for the whole game (not a shared game clock).
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

export function minutesToMs(minutes) {
  var mins = Number(minutes) || 0;
  if (mins <= 0) return 0;
  return mins * 60 * 1000;
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

/**
 * Turn deadline from turn start. When a per-player bank is shorter than the turn
 * limit, the turn clock is capped to that bank (stored at turn start).
 */
export function turnDeadlineIso(startedAt, turnLimitMinutes, bankRemainingMs) {
  var start = toEpochMs(startedAt);
  var turnMs = minutesToMs(turnLimitMinutes);
  if (start == null || turnMs <= 0) return null;
  var endMs = start + turnMs;
  if (bankRemainingMs != null && Number.isFinite(Number(bankRemainingMs))) {
    endMs = Math.min(endMs, start + Math.max(0, Number(bankRemainingMs)));
  }
  return new Date(endMs).toISOString();
}

export function remainingMs(endsAt, now) {
  var end = toEpochMs(endsAt);
  var t = toEpochMs(now);
  if (end == null || t == null) return null;
  return Math.max(0, end - t);
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

export function remainingMsWithSkew(remainingAtSnapshot, serverNow, localNow, receivedAt) {
  if (remainingAtSnapshot == null || !Number.isFinite(Number(remainingAtSnapshot))) return null;
  var atSnapshot = Math.max(0, Number(remainingAtSnapshot));
  var local = toEpochMs(localNow != null ? localNow : Date.now());
  var received = toEpochMs(receivedAt);
  if (local == null || received == null) return atSnapshot;
  return Math.max(0, atSnapshot - (local - received));
}

/**
 * Live bank remaining. While it is this player's turn and clocks are not paused,
 * elapsed turn time is subtracted from the stored bank.
 */
export function liveBankRemainingMs(opts) {
  var o = opts || {};
  if (o.bankRemainingMs == null || !Number.isFinite(Number(o.bankRemainingMs))) return null;
  var stored = Math.max(0, Number(o.bankRemainingMs));
  if (!o.isCurrent || o.turnPaused || o.status !== 'active') return stored;
  var start = toEpochMs(o.turnStartedAt);
  var now = toEpochMs(o.now != null ? o.now : Date.now());
  if (start == null || now == null) return stored;
  return Math.max(0, stored - Math.max(0, now - start));
}

export function chargeBankMs(bankRemainingMs, turnStartedAt, now) {
  if (bankRemainingMs == null || !Number.isFinite(Number(bankRemainingMs))) return null;
  var start = toEpochMs(turnStartedAt);
  var t = toEpochMs(now != null ? now : Date.now());
  if (start == null || t == null) return Math.max(0, Number(bankRemainingMs));
  return Math.max(0, Number(bankRemainingMs) - Math.max(0, t - start));
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
  var gamePart = game > 0 ? game + ' min each' : 'no player bank';
  return turnPart + ' · ' + gamePart;
}

/**
 * @returns {{ turnLimitMinutes: number, gameLimitMinutes: number, turnEndsAt: string|null, turnPaused: boolean }}
 */
export function computeTimerDeadlines(opts) {
  var o = opts || {};
  var limits = normalizeTimerLimits(o);
  var status = o.status;
  var pending = o.pendingFinisherSeat != null ? Number(o.pendingFinisherSeat) : null;
  var turnPaused = Number.isFinite(pending);
  var turnEndsAt =
    status === 'active' && !turnPaused
      ? turnDeadlineIso(o.turnStartedAt, limits.turnLimitMinutes, o.bankRemainingMs)
      : null;
  return {
    turnLimitMinutes: limits.turnLimitMinutes,
    gameLimitMinutes: limits.gameLimitMinutes,
    turnEndsAt: turnEndsAt,
    turnPaused: turnPaused
  };
}

/**
 * Turn expiry skips the current player; bank expiry resigns them (handled by callers).
 * Clocks pause in the final-word window.
 * @returns {'turn'|'bank'|null}
 */
export function expiredTimerKind(opts, now) {
  var o = opts || {};
  if (o.status !== 'active') return null;
  if (o.turnPaused || o.pendingFinisherSeat != null) return null;
  var t = toEpochMs(now != null ? now : Date.now());
  if (t == null) return null;
  var bankMs = o.bankRemainingMs;
  if (bankMs != null && Number.isFinite(Number(bankMs)) && Number(bankMs) <= 0) return 'bank';
  var turnEnd = toEpochMs(o.turnEndsAt);
  if (turnEnd != null && turnEnd <= t) return 'turn';
  return null;
}
