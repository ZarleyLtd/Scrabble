/**
 * Render the 15×15 Scrabble board into a container element.
 */
import { BOARD_SIZE, CENTER, premiumAt } from '../game/engine/board.mjs';
import { tileValue } from '../game/engine/tiles.mjs';

var PREM_LABEL = { DL: 'DL', TL: 'TL', DW: 'DW', TW: 'TW' };

export function renderBoard(container, opts) {
  var board = opts.board;
  var placements = opts.placements || [];
  var selectedBoard = opts.selectedBoard || null;
  var onCellClick = opts.onCellClick;

  var placementKeys = {};
  placements.forEach(function (p) {
    placementKeys[p.row + ',' + p.col] = p;
  });

  container.innerHTML = '';
  container.className = 'board';
  container.setAttribute('role', 'grid');
  container.setAttribute('aria-label', 'Scrabble board');

  for (var r = 0; r < BOARD_SIZE; r++) {
    for (var c = 0; c < BOARD_SIZE; c++) {
      var cell = document.createElement('div');
      var prem = premiumAt(r, c);
      var classes = ['cell'];
      if (prem) classes.push('cell--' + prem.toLowerCase());
      if (r === CENTER && c === CENTER) classes.push('cell--center');

      var locked = board[r][c];
      var tent = placementKeys[r + ',' + c];

      if (locked) {
        classes.push('cell--occupied');
        cell.innerHTML =
          '<span class="cell__letter">' +
          locked.letter +
          '</span><span class="cell__value">' +
          tileValue(locked.letter, !!locked.blank) +
          '</span>';
      } else if (tent) {
        classes.push('cell--tentative');
        if (tent.blank) classes.push('cell--blank');
        if (selectedBoard && selectedBoard.row === r && selectedBoard.col === c) {
          classes.push('cell--selected');
        }
        cell.innerHTML =
          '<span class="cell__letter">' +
          tent.letter +
          '</span><span class="cell__value">' +
          tileValue(tent.letter, !!tent.blank) +
          '</span>';
      } else if (prem) {
        cell.innerHTML = '<span class="cell__prem">' + PREM_LABEL[prem] + '</span>';
      }

      cell.className = classes.join(' ');
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);

      (function (row, col, isTent) {
        cell.addEventListener('click', function () {
          if (typeof onCellClick === 'function') onCellClick(row, col, isTent);
        });
      })(r, c, !!tent);

      container.appendChild(cell);
    }
  }
}

export function renderRack(container, opts) {
  var rack = opts.rack || [];
  var selectedIndex = opts.selectedIndex;
  var onTileClick = opts.onTileClick;
  var disabled = !!opts.disabled;

  container.innerHTML = '';
  container.className = 'rack';

  rack.forEach(function (letter, idx) {
    var tile = document.createElement('button');
    tile.type = 'button';
    tile.className =
      'tile' +
      (letter === '?' ? ' tile--blank' : '') +
      (selectedIndex === idx ? ' tile--selected' : '');
    tile.disabled = disabled;
    tile.dataset.index = String(idx);
    tile.dataset.letter = letter;
    var display = letter === '?' ? '?' : letter;
    tile.innerHTML =
      '<span>' +
      display +
      '</span><span class="tile__val">' +
      (letter === '?' ? 0 : tileValue(letter)) +
      '</span>';
    tile.addEventListener('click', function (e) {
      // Pointer UX handles selection; keep click for exchange mode / accessibility
      if (typeof onTileClick === 'function') onTileClick(idx, letter, e);
    });
    container.appendChild(tile);
  });
}
