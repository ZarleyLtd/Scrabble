/**
 * Pointer UX for tiles: immediate select, rack reorder, board place/move.
 * Uses event delegation so it survives board/rack re-renders.
 */

import { isSquareSelectable } from '../game/engine/placement.mjs';
import { playRackPlaceSound, playBoardPlaceSound } from '../utils/tile-sounds.js';

var DRAG_THRESHOLD = 8;

/**
 * @param {object} opts
 * @param {HTMLElement} opts.boardEl
 * @param {HTMLElement} opts.rackEl
 * @param {() => object} opts.getContext — returns live interaction context
 */
export function attachTileInteraction(opts) {
  var boardEl = opts.boardEl;
  var rackEl = opts.rackEl;
  var getContext = opts.getContext;

  var session = null;
  var ghost = null;
  var suppressClickUntil = 0;
  var lastRackTap = { index: -1, time: 0 };
  var lastBoardTap = { row: -1, col: -1, time: 0 };
  var DBL_TAP_MS = 380;

  function ctx() {
    return getContext() || {};
  }

  function armClickSuppress() {
    suppressClickUntil = Date.now() + 400;
  }

  function clearGhost() {
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    ghost = null;
  }

  function ensureGhost(letter, blank) {
    if (!ghost) {
      ghost = document.createElement('div');
      ghost.className = 'tile tile--ghost' + (blank ? ' tile--blank' : '');
      ghost.setAttribute('aria-hidden', 'true');
      document.body.appendChild(ghost);
    }
    var display = letter === '?' ? '?' : letter;
    ghost.innerHTML = '<span>' + display + '</span>';
    return ghost;
  }

  function moveGhost(clientX, clientY) {
    if (!ghost) return;
    ghost.style.left = clientX + 'px';
    ghost.style.top = clientY + 'px';
  }

  function clearRackShiftPreview() {
    var tiles = rackEl.querySelectorAll('.tile:not(.tile--ghost)');
    for (var i = 0; i < tiles.length; i++) {
      tiles[i].style.transform = '';
      tiles[i].style.transition = '';
      tiles[i].style.zIndex = '';
    }
  }

  /**
   * Slide sibling rack tiles to open a gap at insertBefore (index among all rack tiles).
   */
  function previewRackShift(fromIndex, insertBefore) {
    var tiles = Array.prototype.slice.call(rackEl.querySelectorAll('.tile:not(.tile--ghost)'));
    var n = tiles.length;
    if (!n || fromIndex < 0 || fromIndex >= n) return;

    var order = [];
    for (var a = 0; a < n; a++) {
      if (a !== fromIndex) order.push(a);
    }
    var g = insertBefore > fromIndex ? insertBefore - 1 : insertBefore;
    if (g < 0) g = 0;
    if (g > order.length) g = order.length;
    order.splice(g, 0, fromIndex);

    var finalPos = new Array(n);
    for (var f = 0; f < order.length; f++) finalPos[order[f]] = f;

    var gap = 6;
    for (var j = 0; j < n; j++) {
      var el = tiles[j];
      el.style.transition = 'transform 0.08s ease-out';
      if (j === fromIndex) {
        el.style.transform = '';
        // Stay under tiles sliding into the vacated slot (esp. right→left)
        el.style.zIndex = '0';
        continue;
      }
      var dx = (finalPos[j] - j) * (el.offsetWidth + gap);
      el.style.transform = dx ? 'translateX(' + dx + 'px)' : '';
      // Moving tiles must paint above the dimmed source tile
      el.style.zIndex = dx ? '3' : '1';
    }
  }

  function rackInsertIndex(clientX, clientY) {
    var tiles = Array.prototype.slice.call(rackEl.querySelectorAll('.tile:not(.tile--ghost)'));
    if (!tiles.length) return 0;
    var rackRect = rackEl.getBoundingClientRect();
    if (
      clientY < rackRect.top - 12 ||
      clientY > rackRect.bottom + 12 ||
      clientX < rackRect.left - 24 ||
      clientX > rackRect.right + 24
    ) {
      return -1;
    }
    for (var i = 0; i < tiles.length; i++) {
      var r = tiles[i].getBoundingClientRect();
      var mid = r.left + r.width / 2;
      if (clientX < mid) return i;
    }
    return tiles.length;
  }

  function cellUnder(clientX, clientY) {
    var el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    var cell = el.closest ? el.closest('.cell') : null;
    if (!cell || !boardEl.contains(cell)) return null;
    return {
      row: parseInt(cell.dataset.row, 10),
      col: parseInt(cell.dataset.col, 10),
      el: cell
    };
  }

  function overRack(clientX, clientY) {
    var r = rackEl.getBoundingClientRect();
    return (
      clientX >= r.left - 8 &&
      clientX <= r.right + 8 &&
      clientY >= r.top - 8 &&
      clientY <= r.bottom + 8
    );
  }

  function setSourceDimmed(on) {
    if (!session || !session.sourceEl) return;
    if (on) session.sourceEl.classList.add('tile--dragging');
    else session.sourceEl.classList.remove('tile--dragging');
  }

  function endSession() {
    setSourceDimmed(false);
    clearRackShiftPreview();
    clearGhost();
    if (boardEl) boardEl.classList.remove('board--dragging');
    if (rackEl) rackEl.classList.remove('rack--dragging');
    session = null;
  }

  function legalPlacementsForMove(c, moving) {
    var placements = (c.placements || []).slice();
    if (moving) {
      placements = placements.filter(function (p) {
        return !(p.row === moving.row && p.col === moving.col);
      });
    }
    return placements;
  }

  function canDropOnBoard(c, row, col, moving) {
    if (!c.board) return false;
    var list = legalPlacementsForMove(c, moving);
    var rackCount =
      c.rackCount != null
        ? c.rackCount
        : ((c.rack && c.rack.length) || 0) + ((c.placements && c.placements.length) || 0);
    return isSquareSelectable(c.board, list, row, col, rackCount);
  }

  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) return;
    var c = ctx();
    if (!c.interactive || c.exchangeMode) return;

    var tileBtn = e.target.closest && e.target.closest('.tile');
    if (tileBtn && rackEl.contains(tileBtn)) {
      var idx = parseInt(tileBtn.dataset.index, 10);
      if (isNaN(idx)) return;
      // Do not preventDefault here — that blocks click/dblclick; prevent only once dragging
      if (typeof c.onSelectRack === 'function') c.onSelectRack(idx);
      session = {
        kind: 'rack',
        index: idx,
        letter: tileBtn.dataset.letter || '',
        blank: tileBtn.dataset.letter === '?',
        sourceEl: tileBtn,
        startX: e.clientX,
        startY: e.clientY,
        dragging: false,
        pointerId: e.pointerId
      };
      try {
        rackEl.setPointerCapture(e.pointerId);
      } catch (err) {
        /* ignore */
      }
      return;
    }

    var cell = e.target.closest && e.target.closest('.cell');
    if (cell && boardEl.contains(cell)) {
      var row = parseInt(cell.dataset.row, 10);
      var col = parseInt(cell.dataset.col, 10);
      var isTent = cell.classList.contains('cell--tentative');
      if (!isTent) {
        return;
      }
      // Do not preventDefault — allows normal click handling when not dragging
      if (typeof c.onSelectBoard === 'function') c.onSelectBoard(row, col);
      var letterEl = cell.querySelector('.cell__letter');
      session = {
        kind: 'board',
        row: row,
        col: col,
        letter: letterEl ? letterEl.textContent : '',
        blank: cell.classList.contains('cell--blank') || false,
        sourceEl: cell,
        startX: e.clientX,
        startY: e.clientY,
        dragging: false,
        pointerId: e.pointerId
      };
      var pl = (c.placements || []).find(function (p) {
        return p.row === row && p.col === col;
      });
      if (pl) {
        session.letter = pl.blank ? '?' : pl.letter;
        session.blank = !!pl.blank;
        session.displayLetter = pl.letter;
      }
      try {
        boardEl.setPointerCapture(e.pointerId);
      } catch (err2) {
        /* ignore */
      }
    }
  }

  function onPointerMove(e) {
    if (!session) return;
    if (session.pointerId != null && e.pointerId !== session.pointerId) return;
    var dx = e.clientX - session.startX;
    var dy = e.clientY - session.startY;
    if (!session.dragging) {
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
      session.dragging = true;
      var showLetter = session.displayLetter || session.letter;
      ensureGhost(showLetter, session.blank && !session.displayLetter);
      if (session.blank && session.displayLetter) {
        ghost.classList.add('tile--blank');
        ghost.innerHTML = '<span>' + session.displayLetter + '</span>';
      }
      setSourceDimmed(true);
      boardEl.classList.add('board--dragging');
      rackEl.classList.add('rack--dragging');
    }
    moveGhost(e.clientX, e.clientY);
    if (session.kind === 'rack') {
      var insertAt = rackInsertIndex(e.clientX, e.clientY);
      if (insertAt >= 0) previewRackShift(session.index, insertAt);
      else clearRackShiftPreview();
    }
    e.preventDefault();
  }

  function finishDrag(e) {
    if (!session) return;
    var c = ctx();
    var wasDragging = session.dragging;
    var snap = session;
    endSession();

    if (!wasDragging) {
      var now = Date.now();
      // Double-tap rack tile → auto-place
      if (snap.kind === 'rack' && typeof c.onAutoPlace === 'function') {
        if (snap.index === lastRackTap.index && now - lastRackTap.time <= DBL_TAP_MS) {
          lastRackTap = { index: -1, time: 0 };
          lastBoardTap = { row: -1, col: -1, time: 0 };
          c.onAutoPlace(snap.index);
          return;
        }
        lastRackTap = { index: snap.index, time: now };
        lastBoardTap = { row: -1, col: -1, time: 0 };
        return;
      }
      // Double-tap tentative board tile → return to rack
      if (snap.kind === 'board' && typeof c.onReturnToRack === 'function') {
        if (
          snap.row === lastBoardTap.row &&
          snap.col === lastBoardTap.col &&
          now - lastBoardTap.time <= DBL_TAP_MS
        ) {
          lastBoardTap = { row: -1, col: -1, time: 0 };
          lastRackTap = { index: -1, time: 0 };
          var recalled = c.onReturnToRack(snap.row, snap.col);
          if (!recalled || !recalled.error) playRackPlaceSound();
          return;
        }
        lastBoardTap = { row: snap.row, col: snap.col, time: now };
        lastRackTap = { index: -1, time: 0 };
      }
      return;
    }

    armClickSuppress();
    lastRackTap = { index: -1, time: 0 };
    lastBoardTap = { row: -1, col: -1, time: 0 };

    if (!c.interactive || c.exchangeMode) return;

    var x = e.clientX;
    var y = e.clientY;

    if (snap.kind === 'rack') {
      if (overRack(x, y)) {
        var to = rackInsertIndex(x, y);
        if (to < 0) return;
        var adjusted = to > snap.index ? to - 1 : to;
        var rackLen = (c.rack && c.rack.length) || 0;
        if (rackLen < 1) return;
        if (adjusted > rackLen - 1) adjusted = rackLen - 1;
        if (adjusted < 0) adjusted = 0;
        if (adjusted !== snap.index && typeof c.onReorderRack === 'function') {
          var r = c.onReorderRack(snap.index, adjusted);
          if (!r || !r.error) playRackPlaceSound();
        }
        return;
      }

      var cell = cellUnder(x, y);
      if (cell && canDropOnBoard(c, cell.row, cell.col, null)) {
        if (typeof c.onPlaceFromRack === 'function') {
          var placed = c.onPlaceFromRack(cell.row, cell.col, snap.index);
          if (placed && placed.needBlank) return;
          if (!placed || !placed.error) playBoardPlaceSound();
        }
      }
      return;
    }

    if (snap.kind === 'board') {
      if (overRack(x, y)) {
        var insertAt = rackInsertIndex(x, y);
        if (insertAt < 0) insertAt = (c.rack && c.rack.length) || 0;
        if (typeof c.onReturnToRack === 'function') {
          var ret = c.onReturnToRack(snap.row, snap.col, insertAt);
          if (!ret || !ret.error) playRackPlaceSound();
        }
        return;
      }

      var dest = cellUnder(x, y);
      if (
        dest &&
        (dest.row !== snap.row || dest.col !== snap.col) &&
        canDropOnBoard(c, dest.row, dest.col, { row: snap.row, col: snap.col })
      ) {
        if (typeof c.onMoveOnBoard === 'function') {
          var moved = c.onMoveOnBoard(snap.row, snap.col, dest.row, dest.col);
          if (!moved || !moved.error) playBoardPlaceSound();
        }
      }
    }
  }

  function onPointerUp(e) {
    if (!session) return;
    if (session.pointerId != null && e.pointerId !== session.pointerId) return;
    try {
      if (boardEl.hasPointerCapture && boardEl.hasPointerCapture(e.pointerId)) {
        boardEl.releasePointerCapture(e.pointerId);
      }
      if (rackEl.hasPointerCapture && rackEl.hasPointerCapture(e.pointerId)) {
        rackEl.releasePointerCapture(e.pointerId);
      }
    } catch (err3) {
      /* ignore */
    }
    finishDrag(e);
  }

  function onPointerCancel() {
    endSession();
  }

  function onClickCapture(e) {
    if (Date.now() < suppressClickUntil) {
      e.stopPropagation();
      e.preventDefault();
    }
  }

  boardEl.addEventListener('pointerdown', onPointerDown);
  rackEl.addEventListener('pointerdown', onPointerDown);
  boardEl.addEventListener('click', onClickCapture, true);
  rackEl.addEventListener('click', onClickCapture, true);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);

  return {
    destroy: function () {
      endSession();
      boardEl.removeEventListener('pointerdown', onPointerDown);
      rackEl.removeEventListener('pointerdown', onPointerDown);
      boardEl.removeEventListener('click', onClickCapture, true);
      rackEl.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    },
    playRackSound: playRackPlaceSound,
    playBoardSound: playBoardPlaceSound
  };
}
