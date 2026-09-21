/**
 * Challenge UX: header status flashes + sequential red-X removal animation.
 */

var DEFAULT_FLASH_MS = 1600;
var MARK_STEP_MS = 380;
var MARK_HOLD_MS = 450;

export function setHeaderStatus(text) {
  var el = document.getElementById('headerStatus');
  if (el) el.textContent = text || '';
}

/**
 * Briefly set the header status, then resolve (does not restore previous text).
 */
export function flashHeaderStatus(text, durationMs) {
  return new Promise(function (resolve) {
    var el = document.getElementById('headerStatus');
    if (!el) {
      resolve();
      return;
    }
    el.textContent = text || '';
    el.classList.add('app-header__status--flash');
    setTimeout(function () {
      el.classList.remove('app-header__status--flash');
      resolve();
    }, durationMs != null ? durationMs : DEFAULT_FLASH_MS);
  });
}

function cellAt(boardEl, row, col) {
  if (!boardEl) return null;
  return boardEl.querySelector(
    '.cell[data-row="' + row + '"][data-col="' + col + '"]'
  );
}

function clearChallengeMarks(boardEl) {
  if (!boardEl) return;
  var marks = boardEl.querySelectorAll('.cell__challenge-x');
  for (var i = 0; i < marks.length; i++) {
    if (marks[i].parentNode) marks[i].parentNode.removeChild(marks[i]);
  }
}

/**
 * Place red X marks one-by-one over challenged placements, then clear marks.
 * @param {HTMLElement} boardEl
 * @param {Array<{row:number,col:number}>} placements
 */
export function animateChallengeRemoval(boardEl, placements) {
  var list = (placements || []).slice();
  return new Promise(function (resolve) {
    if (!boardEl || !list.length) {
      resolve();
      return;
    }
    clearChallengeMarks(boardEl);
    var i = 0;
    function next() {
      if (i >= list.length) {
        setTimeout(function () {
          clearChallengeMarks(boardEl);
          resolve();
        }, MARK_HOLD_MS);
        return;
      }
      var p = list[i++];
      var cell = cellAt(boardEl, p.row, p.col);
      if (cell) {
        var mark = document.createElement('span');
        mark.className = 'cell__challenge-x';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = '✕';
        cell.appendChild(mark);
      }
      setTimeout(next, MARK_STEP_MS);
    }
    next();
  });
}

/**
 * Full challenger-side sequence after outcome is known.
 * Success: flash succeeded → X animation → onAfterMarks.
 * Failed: flash failed → onAfterMarks.
 */
export function runChallengeOutcomeFx(opts) {
  var outcome = opts.outcome;
  var boardEl = opts.boardEl;
  var placements = opts.placements || [];
  var onAfterMarks = opts.onAfterMarks || function () {};

  if (outcome === 'success') {
    return flashHeaderStatus('Challenge Succeeded').then(function () {
      return animateChallengeRemoval(boardEl, placements);
    }).then(function () {
      return onAfterMarks();
    });
  }

  return flashHeaderStatus('Challenge Failed').then(function () {
    return onAfterMarks();
  });
}

/**
 * Detect a newly resolved challenge between two snapshots (for observers / refresh).
 * @returns {{ key: string, outcome: string, placements: Array, challengerName: string, challengedName: string }|null}
 */
export function detectNewChallengeOutcome(prev, next) {
  if (!prev || !next) return null;
  var prevMoves = prev.moves || [];
  var nextMoves = next.moves || [];
  for (var i = 0; i < nextMoves.length; i++) {
    var m = nextMoves[i];
    if (!m || m.type !== 'play') continue;
    var outcome = m.challengeOutcome || m.challenge_outcome;
    if (!outcome) continue;
    var prevM = null;
    for (var j = 0; j < prevMoves.length; j++) {
      if (prevMoves[j] && prevMoves[j].id != null && m.id != null && prevMoves[j].id === m.id) {
        prevM = prevMoves[j];
        break;
      }
      if (
        prevMoves[j] &&
        m.id == null &&
        prevMoves[j].type === 'play' &&
        prevMoves[j].seat === m.seat &&
        prevMoves[j].score === m.score &&
        j === i
      ) {
        prevM = prevMoves[j];
        break;
      }
    }
    var prevOutcome = prevM && (prevM.challengeOutcome || prevM.challenge_outcome);
    if (prevOutcome) continue;
    return {
      key: String(m.id != null ? m.id : i) + ':' + outcome,
      outcome: outcome,
      placements: m.placements || (prevM && prevM.placements) || [],
      challengerName: m.challengedByName || m.challenged_by_name || '',
      challengedName: m.name || ''
    };
  }
  return null;
}
