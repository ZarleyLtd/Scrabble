/**
 * Game page UI — local and (later) online modes.
 */

import { renderBoard, renderRack } from '../components/board-view.js';
import { attachTileInteraction } from '../components/tile-interaction.js';
import { renderActionBar } from '../components/action-bar.js';
import { createLocalGame } from '../game/local-game.js';
import { TILE_VALUES } from '../game/engine/tiles.mjs';
import { findAutoPlaceSquare } from '../game/engine/placement.mjs';
import { playBoardPlaceSound } from '../utils/tile-sounds.js';
import { formatEndReason, resolveEndReason } from '../utils/end-reason.js';
import { formatMoveLogEntry, formatScoreboardHtml } from '../utils/format-move-log.js';
import {
  flashHeaderStatus,
  animateChallengeRemoval
} from '../utils/challenge-fx.js';

function $(id) {
  return document.getElementById(id);
}

function poolLetters(state, player) {
  var letters = [];
  (state.board || []).forEach(function (row) {
    (row || []).forEach(function (cell) {
      if (cell && cell.letter) letters.push(cell.letter);
    });
  });
  (state.placements || []).forEach(function (p) {
    if (p && p.letter) letters.push(p.letter);
  });
  if (player && player.rack) letters = letters.concat(player.rack);
  return letters.join('');
}

function showBlankPicker(onPick) {
  var overlay = document.createElement('div');
  overlay.className = 'blank-modal';
  overlay.innerHTML =
    '<div class="blank-modal__card"><h3>Choose blank letter</h3><div class="blank-modal__letters"></div></div>';
  var grid = overlay.querySelector('.blank-modal__letters');
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(function (L) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = L;
    b.addEventListener('click', function () {
      document.body.removeChild(overlay);
      onPick(L);
    });
    grid.appendChild(b);
  });
  document.body.appendChild(overlay);
}

function brief(msg, el) {
  if (typeof BriefMessage !== 'undefined') BriefMessage.show(msg, el);
  else alert(msg);
}

export function startLocalGamePage(root) {
  var params = new URLSearchParams(window.location.search);
  var count = parseInt(params.get('players') || '2', 10);
  var namesParam = params.get('names') || '';
  var names = namesParam
    ? namesParam.split(',').map(function (s) {
        return s.trim();
      })
    : [];

  var game = createLocalGame({
    playerCount: count,
    names: names,
    challengesPerPlayer: (window.SCRABBLE_CONFIG && SCRABBLE_CONFIG.DEFAULT_CHALLENGES) || 2
  });

  root.innerHTML =
    '<div class="game-shell">' +
    '<div>' +
    '<div id="gameOverBanner" class="game-over-banner hidden"></div>' +
    '<div class="board-wrap"><div id="board"></div></div>' +
    '<div class="card" style="margin-top:0.5rem">' +
    '<div id="rack"></div>' +
    '<p class="turn-preview" id="turnPreview"></p>' +
    '<div id="actionButtons"></div>' +
    '</div>' +
    '</div>' +
    '<div class="side-panel">' +
    '<div class="card"><h3>Scores</h3><ul class="scores-list" id="scores"></ul>' +
    '<p class="muted" id="bagInfo"></p></div>' +
    '<div class="card"><h3>Moves</h3><div class="move-log" id="moveLog"></div></div>' +
    '<div class="card hidden" id="gameOver"></div>' +
    '</div>' +
    '</div>';

  var tileUX = null;
  var actionsExpanded = false;
  var challengeFxBusy = false;

  function challengeLabel(challengerName, challengedName) {
    return (
      (challengerName || 'Player') +
      ' is challenging ' +
      (challengedName || 'Player') +
      "'s turn"
    );
  }

  function runLocalChallenge(assumeInvalid, anchorEl) {
    if (challengeFxBusy) return;
    var s = game.getState();
    if (s.challengeableMoveIndex == null) return;
    var move = s.moves[s.challengeableMoveIndex];
    if (!move || move.type !== 'play') return;

    var placements = (move.placements || []).map(function (pl) {
      return { row: pl.row, col: pl.col };
    });
    var challengedName = move.name || 'Player';
    var current = s.players.find(function (p) {
      return p.seat === s.currentSeat;
    });
    if (!current || current.resigned || current.seat === move.seat || !(current.challengesLeft > 0)) {
      brief(current && current.seat === move.seat ? 'Cannot challenge your own move' : 'No challenges left', anchorEl);
      return;
    }
    var challengerName = current.name;

    challengeFxBusy = true;
    actionsExpanded = false;
    render();

    flashHeaderStatus(challengeLabel(challengerName, challengedName))
      .then(function () {
        if (assumeInvalid) {
          return flashHeaderStatus('Challenge Succeeded')
            .then(function () {
              return animateChallengeRemoval($('board'), placements);
            })
            .then(function () {
              var r = game.challengeLocal(true);
              if (r.error) brief(r.error, anchorEl);
            });
        }
        var r = game.challengeLocal(false);
        if (r.error) {
          brief(r.error, anchorEl);
          return;
        }
        return flashHeaderStatus('Challenge Failed');
      })
      .finally(function () {
        challengeFxBusy = false;
        render();
      });
  }

  function autoPlaceFromRack(idx) {
    var s = game.getState();
    var me = s.players.find(function (p) {
      return p.seat === s.currentSeat;
    });
    if (s.exchangeMode) return;
    if (s.status !== 'active' || !me || me.resigned) return;
    var rackCount = me.rack.length + s.placements.length;
    var target = findAutoPlaceSquare(s.board, s.placements, rackCount);
    if (!target) {
      if (!s.placements.length) {
        brief('Place the first tile on the board first', $('rack'));
      } else {
        brief('No legal square nearby', $('rack'));
      }
      return;
    }
    var result = game.placeOnBoard(target.row, target.col, idx);
    if (result.error) {
      brief(result.error, $('rack'));
      return;
    }
    if (result.needBlank) {
      showBlankPicker(function (letter) {
        var c = game.confirmBlank(result.pending, result.rackIndex, letter);
        if (c.error) brief(c.error, $('rack'));
        else playBoardPlaceSound();
        render();
      });
      return;
    }
    playBoardPlaceSound();
    render();
  }

  function bindTileUX() {
    if (tileUX) return;
    tileUX = attachTileInteraction({
      boardEl: $('board'),
      rackEl: $('rack'),
      getContext: function () {
        var s = game.getState();
        var me = s.players.find(function (p) {
          return p.seat === s.currentSeat;
        });
        return {
          interactive: s.status === 'active' && me && !me.resigned && s.pendingFinisherSeat == null,
          exchangeMode: s.exchangeMode,
          board: s.board,
          placements: s.placements,
          rack: me ? me.rack : [],
          rackCount: (me ? me.rack.length : 0) + s.placements.length,
          onSelectRack: function (idx) {
            var cur = game.getState();
            if (cur.selectedRackIndex === idx && !cur.selectedBoard) return;
            game.selectRackTile(idx);
            render();
          },
          onSelectBoard: function (row, col) {
            var cur = game.getState();
            if (
              cur.selectedBoard &&
              cur.selectedBoard.row === row &&
              cur.selectedBoard.col === col
            ) {
              return;
            }
            game.selectBoardTile(row, col);
            render();
          },
          onAutoPlace: autoPlaceFromRack,
          onReorderRack: function (from, to) {
            var r = game.reorderRack(from, to);
            render();
            return r;
          },
          onPlaceFromRack: function (row, col, rackIndex) {
            var result = game.placeOnBoard(row, col, rackIndex);
            if (result.error) {
              brief(result.error, $('board'));
              return result;
            }
            if (result.needBlank) {
              showBlankPicker(function (letter) {
                var c = game.confirmBlank(result.pending, result.rackIndex, letter);
                if (c.error) brief(c.error, $('board'));
                else playBoardPlaceSound();
                render();
              });
              render();
              return result;
            }
            render();
            return result;
          },
          onMoveOnBoard: function (fr, fc, tr, tc) {
            var r = game.movePlacement(fr, fc, tr, tc);
            if (r.error) brief(r.error, $('board'));
            render();
            return r;
          },
          onReturnToRack: function (row, col, insertAt) {
            var r = game.recallPlacement(row, col, insertAt);
            if (r.error) brief(r.error, $('rack'));
            render();
            return r;
          }
        };
      }
    });
  }

  function render() {
    var s = game.getState();
    var me = s.players.find(function (p) {
      return p.seat === s.currentSeat;
    });
    var finalWord = s.pendingFinisherSeat != null;

    var hasSelection =
      (s.selectedRackIndex != null || s.selectedBoard) && !s.exchangeMode;

    renderBoard($('board'), {
      board: s.board,
      placements: s.placements,
      selectedTile: hasSelection,
      selectedBoard: s.exchangeMode ? null : s.selectedBoard,
      movingFrom: s.selectedBoard,
      rackCount: (me ? me.rack.length : 0) + s.placements.length,
      interactive: s.status === 'active' && me && !me.resigned && !finalWord,
      onCellClick: function (row, col, isTent) {
        if (isTent) {
          // Selection / drag handled by pointer UX; ignore click recall
          return;
        }
        if (s.selectedBoard) {
          var moved = game.movePlacement(s.selectedBoard.row, s.selectedBoard.col, row, col);
          if (moved.error) brief(moved.error, $('board'));
          else playBoardPlaceSound();
          render();
          return;
        }
        var result = game.placeOnBoard(row, col);
        if (result.error) {
          brief(result.error, $('board'));
          return;
        }
        if (result.needBlank) {
          showBlankPicker(function (letter) {
            var c = game.confirmBlank(result.pending, result.rackIndex, letter);
            if (c.error) brief(c.error, $('board'));
            else playBoardPlaceSound();
            render();
          });
          return;
        }
        playBoardPlaceSound();
        render();
      }
    });

    renderRack($('rack'), {
      rack: me ? me.rack : [],
      // Selection highlight only in exchange mode (applied below)
      selectedIndex: null,
      disabled: s.status !== 'active' || !me || me.resigned,
      onTileClick: function (idx) {
        if (s.exchangeMode) {
          game.selectRackTile(idx);
          render();
          return;
        }
        // Pointer UX selects on pointerdown; click is a no-op fallback
        game.selectRackTile(idx);
        render();
      }
    });
    if (s.exchangeMode) {
      var tiles = $('rack').querySelectorAll('.tile');
      Object.keys(s.exchangeSelected).forEach(function (k) {
        if (tiles[k]) tiles[k].classList.add('tile--selected');
      });
    }

    bindTileUX();

    var preview = game.previewScore();
    var previewEl = $('turnPreview');
    var statusEl = $('headerStatus');
    if (statusEl) {
      if (!challengeFxBusy) {
        statusEl.textContent =
          s.status === 'finished'
            ? 'Game over'
            : finalWord
              ? 'Final word — challenge or end'
              : me
                ? me.name + "'s turn"
                : '';
      }
    }
    if (preview && preview.error) {
      previewEl.innerHTML = '<span style="color:var(--danger)">' + preview.error + '</span>';
    } else if (preview && preview.total != null) {
      previewEl.innerHTML =
        'Preview: <strong>' +
        preview.total +
        '</strong> — ' +
        preview.words
          .map(function (w) {
            return w.word + ' (' + w.score + ')';
          })
          .join(', ') +
        (preview.bingo ? ' +bingo' : '');
    } else if (s.exchangeMode) {
      previewEl.textContent = 'Exchange mode: select tiles, then confirm exchange';
    } else {
      previewEl.textContent = '';
    }

    $('scores').innerHTML = s.players
      .map(function (p) {
        return (
          '<li class="' +
          (p.seat === s.currentSeat ? 'active' : '') +
          (p.resigned ? ' resigned' : '') +
          '"><span>' +
          p.name +
          (p.challengesLeft != null
            ? ' · ' + p.challengesLeft + (Number(p.challengesLeft) === 1 ? ' challenge' : ' challenges')
            : '') +
          '</span><span>' +
          p.score +
          '</span></li>'
        );
      })
      .join('');

    $('bagInfo').textContent =
      'Bag: ' + s.bag.length + ' · Turn ' + s.turnNumber + (s.status === 'finished' ? ' · FINISHED' : '');

    $('moveLog').innerHTML = s.moves
      .slice(-40)
      .map(formatMoveLogEntry)
      .filter(Boolean)
      .join('');
    var moveLogEl = $('moveLog');
    moveLogEl.scrollTop = moveLogEl.scrollHeight;

    var btns = $('actionButtons');
    var turnInProgress = s.placements.length > 0;
    var canAct = s.status === 'active' && me && !me.resigned && !finalWord;

    var primary;
    if (finalWord) {
      var iAmFinisher = me && me.seat === s.pendingFinisherSeat;
      primary = {
        label: iAmFinisher ? 'Waiting' : 'End game',
        className: 'primary',
        disabled: !!iAmFinisher || !me || me.resigned,
        onClick: function (e) {
          var r = game.endGame();
          if (r.error) brief(r.error, e.target);
          else brief('Game over', e.target);
          actionsExpanded = false;
          render();
        }
      };
    } else if (s.exchangeMode) {
      primary = {
        label: 'Confirm Exchange',
        className: 'primary',
        disabled: !canAct,
        onClick: function (e) {
          var r = game.confirmExchange();
          if (r.error) brief(r.error, e.target);
          else brief('Exchanged', e.target);
          actionsExpanded = false;
          render();
        }
      };
    } else if (turnInProgress) {
      primary = {
        label: 'Done',
        className: 'success',
        disabled: !canAct,
        onClick: function (e) {
          var r = game.commitMove();
          if (r.error) brief(r.error, e.target);
          else {
            var msg = '+' + r.move.score;
            if (r.drawn && r.drawn.length) msg += ' · drew ' + r.drawn.length;
            brief(msg, e.target);
          }
          actionsExpanded = false;
          render();
        }
      };
    } else {
      primary = {
        label: 'Pass',
        className: 'primary',
        disabled: !canAct,
        onClick: function (e) {
          if (!confirm('Pass your turn?')) return;
          game.pass();
          brief('Passed', e.target);
          actionsExpanded = false;
          render();
        }
      };
    }

    var menuActions = [];
    menuActions.push({
      label: 'Recall',
      disabled: !canAct || !turnInProgress,
      onClick: function () {
        game.recallAll();
        actionsExpanded = false;
        render();
      }
    });
    if (s.exchangeMode) {
      menuActions.push({
        label: 'Cancel Exchange',
        disabled: !canAct,
        onClick: function () {
          game.toggleExchangeMode();
          actionsExpanded = false;
          render();
        }
      });
    } else {
      menuActions.push({
        label: 'Exchange',
        disabled: !canAct || turnInProgress,
        onClick: function (e) {
          game.toggleExchangeMode();
          brief('Select tiles to swap', e.target);
          actionsExpanded = false;
          render();
        }
      });
    }
    menuActions.push({
      label: 'Resign',
      className: 'danger',
      disabled: !canAct,
      onClick: function (e) {
        if (!confirm('Resign from this game?')) return;
        game.resign();
        brief('Resigned', e.target);
        actionsExpanded = false;
        render();
      }
    });
    menuActions.push({
      label: '2-letter words',
      onClick: function (e) {
        if (window.ScrabbleHeader) ScrabbleHeader.openTwoLetters(e.target);
        actionsExpanded = false;
        render();
      }
    });
    if (s.challengeableMoveIndex != null) {
      var challengeMove = s.moves[s.challengeableMoveIndex];
      var canChallenge =
        s.status === 'active' &&
        !challengeFxBusy &&
        me &&
        !me.resigned &&
        challengeMove &&
        me.seat !== challengeMove.seat &&
        me.challengesLeft > 0;
      menuActions.push({
        label: 'Challenge (invalid)',
        className: 'danger',
        disabled: !canChallenge,
        onClick: function (e) {
          runLocalChallenge(true, e.target);
        }
      });
      menuActions.push({
        label: 'Challenge (valid)',
        disabled: !canChallenge,
        onClick: function (e) {
          runLocalChallenge(false, e.target);
        }
      });
    }

    renderActionBar(btns, {
      primary: primary,
      actions: menuActions,
      expanded: actionsExpanded,
      disabled: s.status !== 'active',
      onToggle: function () {
        actionsExpanded = !actionsExpanded;
        render();
      }
    });

    var reasonKey = resolveEndReason(s);
    var reasonText = formatEndReason(reasonKey);
    var banner = $('gameOverBanner');
    var over = $('gameOver');
    if (s.status === 'finished') {
      banner.classList.remove('hidden');
      banner.innerHTML =
        '<h2>Game Over</h2><p class="game-over-banner__reason">' +
        reasonText +
        '</p>' +
        formatScoreboardHtml(s.players);
      over.classList.remove('hidden');
      over.className = 'card game-over';
      over.innerHTML =
        '<h3>Final scores</h3><p class="game-over__reason">' +
        reasonText +
        '</p>' +
        formatScoreboardHtml(s.players) +
        '<p><a href="index.html">New game</a></p>';
    } else {
      banner.classList.add('hidden');
      banner.innerHTML = '';
      over.classList.add('hidden');
    }
  }

  if (window.ScrabbleHeader) {
    ScrabbleHeader.setGameActive(true);
    ScrabbleHeader.setTwoLetterHandler(function (anchor) {
      var s = game.getState();
      var current = s.players.find(function (p) {
        return p.seat === s.currentSeat;
      });
      var letters = poolLetters(s, current);
      ScrabbleAPI.twoLetterWords({ letters: letters })
        .then(function (data) {
          ScrabbleHeader.showTwoLetterPanel((data && data.words) || []);
        })
        .catch(function (e) {
          brief(e.message || 'Could not load words', anchor);
        });
    });
  }
  render();
  return game;
}

// unused import guard
void TILE_VALUES;
