/**
 * Online multiplayer game page — API + Realtime.
 */

import { renderBoard, renderRack } from '../components/board-view.js';
import { attachTileInteraction } from '../components/tile-interaction.js';
import { renderActionBar } from '../components/action-bar.js';
import { BLANK } from '../game/engine/tiles.mjs';
import { scoreTurn } from '../game/engine/scoring.mjs';
import { findAutoPlaceSquare, isSquareSelectable } from '../game/engine/placement.mjs';
import { playBoardPlaceSound } from '../utils/tile-sounds.js';
import { formatEndReason, resolveEndReason } from '../utils/end-reason.js';
import { formatMoveLogEntry, formatScoreboardHtml } from '../utils/format-move-log.js';

function $(id) {
  return document.getElementById(id);
}

function brief(msg, el) {
  if (typeof BriefMessage !== 'undefined') BriefMessage.show(msg, el);
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

export function startOnlineGamePage(ctx) {
  var code = ctx.code;
  var creds = typeof PlayerStorage !== 'undefined' ? PlayerStorage.load(code) : null;
  var snapshot = null;
  var placements = [];
  var selectedRackIndex = null;
  var selectedBoard = null;
  var exchangeMode = false;
  var exchangeSelected = {};
  var busy = false;
  var tileUX = null;
  var actionsExpanded = false;

  function setError(msg) {
    if (!ctx.errorEl) return;
    if (!msg) {
      ctx.errorEl.classList.add('hidden');
      ctx.errorEl.textContent = '';
      return;
    }
    ctx.errorEl.textContent = msg;
    ctx.errorEl.classList.remove('hidden');
  }

  function refresh() {
    if (!creds || !creds.token) return Promise.resolve();
    return ScrabbleAPI.state(code, creds.token).then(function (data) {
      snapshot = data;
      if (data.gameId && window.ScrabbleRealtime) {
        ensureRealtime(data.gameId);
      }
      renderAll();
      return data;
    });
  }

  var realtimeReady = false;
  function ensureRealtime(gameId) {
    if (realtimeReady || !window.ScrabbleRealtime) return;
    realtimeReady = true;
    ScrabbleRealtime.subscribe(
      gameId,
      function (row) {
        if (!snapshot || row.version > snapshot.version) refresh().catch(function () {});
      },
      function (connected) {
        if (!connected) {
          ScrabbleRealtime.startHeartbeat(function () {
            refresh().catch(function () {});
          });
        } else {
          ScrabbleRealtime.stopHeartbeat();
        }
      }
    );
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') refresh().catch(function () {});
    });
  }

  function myPlayer() {
    if (!snapshot || !creds) return null;
    return (snapshot.players || []).find(function (p) {
      return p.id === creds.playerId || p.seat === creds.seat;
    });
  }

  function isMyTurn() {
    var me = myPlayer();
    return (
      snapshot &&
      snapshot.status === 'active' &&
      me &&
      !me.resigned &&
      me.seat === snapshot.currentSeat
    );
  }

  function rackLetters() {
    var me = myPlayer();
    return (me && me.rack) || [];
  }

  function mutate(fn) {
    if (busy) return;
    busy = true;
    Promise.resolve()
      .then(fn)
      .then(function () {
        placements = [];
        selectedRackIndex = null;
        selectedBoard = null;
        exchangeMode = false;
        exchangeSelected = {};
        return refresh();
      })
      .catch(function (e) {
        if (e.code === 409) {
          brief('Board updated — refreshing', ctx.gameRoot);
          return refresh();
        }
        setError(e.message || String(e));
      })
      .finally(function () {
        busy = false;
      });
  }

  function showJoin() {
    ctx.joinPanel.classList.remove('hidden');
    ctx.joinPanel.innerHTML =
      '<h2>Join game ' +
      code +
      '</h2>' +
      '<div class="field"><label for="joinName">Your name</label>' +
      '<input id="joinName" type="text" maxlength="24" autocomplete="nickname" /></div>' +
      '<div class="btn-row"><button type="button" class="primary" id="btnJoin">Claim seat</button></div>';
    $('btnJoin').addEventListener('click', function () {
      var name = ($('joinName').value || '').trim();
      if (!name) {
        setError('Enter your name');
        return;
      }
      setError('');
      ScrabbleAPI.joinGame({ code: code, name: name })
        .then(function (data) {
          creds = { playerId: data.player.id, token: data.player.token, seat: data.player.seat, name: data.player.name };
          PlayerStorage.save(code, data.player);
          snapshot = data;
          ctx.joinPanel.classList.add('hidden');
          if (data.gameId) ensureRealtime(data.gameId);
          renderAll();
        })
        .catch(function (e) {
          setError(e.message || String(e));
        });
    });
  }

  function renderLobby() {
    ctx.lobbyPanel.classList.remove('hidden');
    ctx.gameRoot.innerHTML = '';
    var seats = [];
    for (var i = 0; i < snapshot.playerCount; i++) {
      var p = (snapshot.players || []).find(function (x) {
        return x.seat === i;
      });
      seats.push(p ? p.name + (p.isHost ? ' (host)' : '') : '— waiting —');
    }
    var shareUrl = window.location.href.split('#')[0];
    ctx.lobbyPanel.innerHTML =
      '<h2>Lobby</h2>' +
      '<p class="muted">Waiting for ' +
      snapshot.playerCount +
      ' players. Game starts when the last seat is claimed.</p>' +
      '<ul class="lobby-players">' +
      seats
        .map(function (s, i) {
          return '<li>Seat ' + (i + 1) + ': ' + s + '</li>';
        })
        .join('') +
      '</ul>' +
      '<p class="muted">Share link</p>' +
      '<div class="share-box"><input id="shareUrl" readonly value="' +
      shareUrl.replace(/"/g, '&quot;') +
      '" />' +
      '<button type="button" id="btnCopy">Copy</button>' +
      '<button type="button" id="btnWhatsApp">WhatsApp</button></div>';
    $('btnCopy').addEventListener('click', function (e) {
      var input = $('shareUrl');
      input.select();
      navigator.clipboard.writeText(input.value).then(
        function () {
          brief('Copied', e.target);
        },
        function () {
          brief('Copy failed', e.target);
        }
      );
    });
    $('btnWhatsApp').addEventListener('click', function () {
      var text = encodeURIComponent('Join my Scrabble game: ' + shareUrl);
      window.open('https://wa.me/?text=' + text, '_blank');
    });
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

  function bindTileUX() {
    if (tileUX || !$('board') || !$('rack')) return;
    tileUX = attachTileInteraction({
      boardEl: $('board'),
      rackEl: $('rack'),
      getContext: function () {
        var me = myPlayer();
        var myTurn = isMyTurn();
        return {
          interactive: myTurn,
          exchangeMode: exchangeMode,
          board: snapshot && snapshot.board,
          placements: placements,
          rack: me ? me.rack : [],
          rackCount: (me ? me.rack.length : 0) + placements.length,
          onSelectRack: function (idx) {
            if (selectedRackIndex === idx && !selectedBoard) return;
            selectedRackIndex = idx;
            selectedBoard = null;
            renderGame();
          },
          onSelectBoard: function (row, col) {
            if (
              selectedBoard &&
              selectedBoard.row === row &&
              selectedBoard.col === col
            ) {
              return;
            }
            selectedBoard = { row: row, col: col };
            selectedRackIndex = null;
            renderGame();
          },
          onAutoPlace: autoPlaceFromRack,
          onReorderRack: function (from, to) {
            if (!me || from === to) return { ok: true };
            if (from < 0 || from >= me.rack.length || to < 0 || to >= me.rack.length) {
              return { error: 'Invalid position' };
            }
            var tile = me.rack.splice(from, 1)[0];
            me.rack.splice(to, 0, tile);
            selectedRackIndex = to;
            selectedBoard = null;
            renderGame();
            return { ok: true };
          },
          onPlaceFromRack: function (row, col, rackIndex) {
            selectedRackIndex = rackIndex;
            var letter = me.rack[rackIndex];
            if (letter == null) return { error: 'Select a tile first' };
            var trial = placements.concat([
              {
                row: row,
                col: col,
                letter: letter === BLANK ? 'A' : letter,
                blank: letter === BLANK
              }
            ]);
            if (!lineOk(trial)) {
              brief('Tiles must be in a single row or column', $('board'));
              return { error: 'Tiles must be in a single row or column' };
            }
            function addPlacement(L, blank, from) {
              me.rack.splice(rackIndex, 1);
              placements.push({ row: row, col: col, letter: L, blank: blank, fromRack: from });
              selectedRackIndex = null;
              selectedBoard = null;
              renderGame();
            }
            if (letter === BLANK) {
              showBlankPicker(function (L) {
                addPlacement(L, true, BLANK);
                playBoardPlaceSound();
              });
              return { needBlank: true };
            }
            addPlacement(letter, false, letter);
            return { ok: true };
          },
          onMoveOnBoard: function (fr, fc, tr, tc) {
            var idx = placements.findIndex(function (p) {
              return p.row === fr && p.col === fc;
            });
            if (idx < 0) return { error: 'Nothing to move' };
            var others = placements.filter(function (_, i) {
              return i !== idx;
            });
            var moving = placements[idx];
            var trial = others.concat([
              { row: tr, col: tc, letter: moving.letter, blank: !!moving.blank }
            ]);
            if (!lineOk(trial)) {
              brief('Tiles must be in a single row or column', $('board'));
              return { error: 'Tiles must be in a single row or column' };
            }
            placements[idx] = {
              row: tr,
              col: tc,
              letter: moving.letter,
              blank: !!moving.blank,
              fromRack: moving.fromRack
            };
            selectedBoard = { row: tr, col: tc };
            selectedRackIndex = null;
            renderGame();
            return { ok: true };
          },
          onReturnToRack: function (row, col, insertAt) {
            var idx = placements.findIndex(function (p) {
              return p.row === row && p.col === col;
            });
            if (idx < 0) return { error: 'Nothing to recall' };
            var pl = placements.splice(idx, 1)[0];
            var tile = pl.fromRack;
            if (insertAt == null || insertAt < 0 || insertAt > me.rack.length) {
              me.rack.push(tile);
              selectedRackIndex = me.rack.length - 1;
            } else {
              me.rack.splice(insertAt, 0, tile);
              selectedRackIndex = insertAt;
            }
            selectedBoard = null;
            renderGame();
            return { ok: true };
          }
        };
      }
    });
  }

  function autoPlaceFromRack(idx) {
    if (!isMyTurn() || exchangeMode) return;
    var me = myPlayer();
    if (!me || me.resigned) return;
    var board = snapshot.board;
    var rackCount = me.rack.length + placements.length;
    var target = findAutoPlaceSquare(board, placements, rackCount);
    if (!target) {
      if (!placements.length) {
        brief('Place the first tile on the board first', $('rack'));
      } else {
        brief('No legal square nearby', $('rack'));
      }
      return;
    }
    var letter = me.rack[idx];
    if (letter == null) return;
    function addPlacement(L, blank, from) {
      me.rack.splice(idx, 1);
      placements.push({
        row: target.row,
        col: target.col,
        letter: L,
        blank: blank,
        fromRack: from
      });
      selectedRackIndex = null;
      selectedBoard = null;
      playBoardPlaceSound();
      renderGame();
    }
    if (letter === BLANK) {
      showBlankPicker(function (L) {
        addPlacement(L, true, BLANK);
      });
    } else {
      addPlacement(letter, false, letter);
    }
  }

  function renderGame() {
    ctx.lobbyPanel.classList.add('hidden');
    ctx.joinPanel.classList.add('hidden');
    if (!ctx.gameRoot.querySelector('.game-shell')) {
      if (tileUX) {
        tileUX.destroy();
        tileUX = null;
      }
      ctx.gameRoot.innerHTML =
        '<div class="game-shell">' +
        '<div><div id="gameOverBanner" class="game-over-banner hidden"></div>' +
        '<div class="board-wrap"><div id="board"></div></div>' +
        '<div class="card" style="margin-top:0.5rem"><div id="rack"></div>' +
        '<p class="turn-preview" id="turnPreview"></p>' +
        '<div id="actionButtons"></div></div></div>' +
        '<div class="side-panel">' +
        '<div class="card"><h3>Scores</h3><ul class="scores-list" id="scores"></ul>' +
        '<p class="muted" id="bagInfo"></p></div>' +
        '<div class="card"><h3>Moves</h3><div class="move-log" id="moveLog"></div></div>' +
        '<div class="card hidden" id="gameOver"></div></div></div>';
    }

    var board = snapshot.board;
    var me = myPlayer();
    var myTurn = isMyTurn();
    var hasSelection =
      (selectedRackIndex != null || selectedBoard) && !exchangeMode && myTurn;

    renderBoard($('board'), {
      board: board,
      placements: placements,
      selectedTile: hasSelection,
      selectedBoard: exchangeMode || !myTurn ? null : selectedBoard,
      movingFrom: selectedBoard,
      rackCount: (me ? me.rack.length : 0) + placements.length,
      interactive: myTurn,
      onCellClick: function (row, col, isTent) {
        if (!myTurn) return;
        if (isTent) return;
        if (selectedBoard) {
          var idx = placements.findIndex(function (p) {
            return p.row === selectedBoard.row && p.col === selectedBoard.col;
          });
          if (idx < 0) return;
          var others = placements.filter(function (_, i) {
            return i !== idx;
          });
          var moving = placements[idx];
          var reach = (me ? me.rack.length : 0) + placements.length;
          if (
            !others.length &&
            !isSquareSelectable(board, [], row, col, reach)
          ) {
            brief('Square too far from existing tiles', $('board'));
            return;
          }
          var trial = others.concat([
            { row: row, col: col, letter: moving.letter, blank: !!moving.blank }
          ]);
          if (!lineOk(trial)) {
            brief('Tiles must be in a single row or column', $('board'));
            return;
          }
          placements[idx] = {
            row: row,
            col: col,
            letter: moving.letter,
            blank: !!moving.blank,
            fromRack: moving.fromRack
          };
          selectedBoard = { row: row, col: col };
          selectedRackIndex = null;
          playBoardPlaceSound();
          renderGame();
          return;
        }
        if (selectedRackIndex == null) {
          brief('Select a tile first', $('board'));
          return;
        }
        if (
          !placements.length &&
          !isSquareSelectable(board, [], row, col, me.rack.length)
        ) {
          brief('Square too far from existing tiles', $('board'));
          return;
        }
        var letter = me.rack[selectedRackIndex];
        function addPlacement(L, blank, from) {
          me.rack.splice(selectedRackIndex, 1);
          placements.push({ row: row, col: col, letter: L, blank: blank, fromRack: from });
          selectedRackIndex = null;
          selectedBoard = null;
          playBoardPlaceSound();
          renderGame();
        }
        if (letter === BLANK) {
          showBlankPicker(function (L) {
            addPlacement(L, true, BLANK);
          });
        } else {
          addPlacement(letter, false, letter);
        }
      }
    });

    renderRack($('rack'), {
      rack: me ? me.rack : [],
      selectedIndex: exchangeMode ? null : selectedRackIndex,
      disabled: !myTurn || (me && me.resigned),
      onTileClick: function (idx) {
        if (!myTurn) return;
        if (exchangeMode) {
          if (exchangeSelected[idx]) delete exchangeSelected[idx];
          else exchangeSelected[idx] = true;
          renderGame();
          return;
        }
        selectedRackIndex = idx;
        selectedBoard = null;
        renderGame();
      },
      onTileDblClick: function (idx) {
        autoPlaceFromRack(idx);
      }
    });
    if (exchangeMode) {
      var tiles = $('rack').querySelectorAll('.tile');
      Object.keys(exchangeSelected).forEach(function (k) {
        if (tiles[k]) tiles[k].classList.add('tile--selected');
      });
    }

    bindTileUX();

    var preview = placements.length ? scoreTurn(board, placements) : null;
    var previewEl = $('turnPreview');
    if (preview && !preview.ok) {
      previewEl.innerHTML = '<span style="color:var(--danger)">' + preview.error + '</span>';
    } else if (preview && preview.ok) {
      previewEl.innerHTML =
        'Preview: <strong>' +
        preview.total +
        '</strong> — ' +
        preview.words
          .map(function (w) {
            return w.word + ' (' + w.score + ')';
          })
          .join(', ');
    } else {
      var cur = (snapshot.players || []).find(function (p) {
        return p.seat === snapshot.currentSeat;
      });
      previewEl.textContent = myTurn
        ? 'Your turn'
        : cur
          ? 'Waiting for ' + cur.name
          : '';
    }

    $('scores').innerHTML = (snapshot.players || [])
      .map(function (p) {
        return (
          '<li class="' +
          (p.seat === snapshot.currentSeat ? 'active' : '') +
          (p.resigned ? ' resigned' : '') +
          '"><span>' +
          p.name +
          ' · tiles ' +
          (p.rackCount != null ? p.rackCount : p.rack ? p.rack.length : '?') +
          (p.challengesLeft != null ? ' · C' + p.challengesLeft : '') +
          '</span><span>' +
          p.score +
          '</span></li>'
        );
      })
      .join('');

    $('bagInfo').textContent =
      'Bag: ' +
      (snapshot.bagCount != null ? snapshot.bagCount : '?') +
      ' · Turn ' +
      snapshot.turnNumber +
      (snapshot.status === 'finished' ? ' · FINISHED' : '');

    $('moveLog').innerHTML = (snapshot.moves || [])
      .slice(-40)
      .map(formatMoveLogEntry)
      .filter(Boolean)
      .join('');
    var moveLogEl = $('moveLog');
    if (moveLogEl) moveLogEl.scrollTop = moveLogEl.scrollHeight;

    var btns = $('actionButtons');
    var turnInProgress = placements.length > 0;
    var canAct = myTurn && me && !me.resigned;

    var primary;
    if (exchangeMode) {
      primary = {
        label: 'Confirm Exchange',
        className: 'primary',
        disabled: !canAct || turnInProgress,
        onClick: function (e) {
          var indices = Object.keys(exchangeSelected).map(Number);
          var tilesToEx = indices.map(function (i) {
            return me.rack[i];
          });
          mutate(function () {
            return ScrabbleAPI.exchange({
              code: code,
              token: creds.token,
              expectedVersion: snapshot.version,
              tiles: tilesToEx
            }).then(function () {
              brief('Exchanged', e.target);
            });
          });
          actionsExpanded = false;
        }
      };
    } else if (turnInProgress) {
      primary = {
        label: 'Done',
        className: 'success',
        disabled: !canAct,
        onClick: function (e) {
          mutate(function () {
            return ScrabbleAPI.commitMove({
              code: code,
              token: creds.token,
              expectedVersion: snapshot.version,
              placements: placements.map(function (p) {
                return { row: p.row, col: p.col, letter: p.letter, blank: !!p.blank };
              })
            }).then(function (data) {
              var msg = '+' + ((data && data.move && data.move.score) || '');
              if (data && data.drawn && data.drawn.length) {
                msg += ' · drew ' + data.drawn.length;
              }
              brief(msg, e.target);
            });
          });
          actionsExpanded = false;
        }
      };
    } else {
      primary = {
        label: 'Pass',
        className: 'primary',
        disabled: !canAct,
        onClick: function (e) {
          mutate(function () {
            return ScrabbleAPI.pass({
              code: code,
              token: creds.token,
              expectedVersion: snapshot.version
            }).then(function () {
              brief('Passed', e.target);
            });
          });
          actionsExpanded = false;
        }
      };
    }

    var menuActions = [];
    menuActions.push({
      label: 'Get Letter Tiles',
      disabled: !canAct || turnInProgress || exchangeMode,
      onClick: function (e) {
        mutate(function () {
          return ScrabbleAPI.drawTiles({
            code: code,
            token: creds.token,
            expectedVersion: snapshot.version
          }).then(function () {
            brief('Tiles drawn', e.target);
          });
        });
        actionsExpanded = false;
      }
    });
    menuActions.push({
      label: 'Recall',
      disabled: !canAct || !turnInProgress,
      onClick: function () {
        placements.forEach(function (pl) {
          me.rack.push(pl.fromRack);
        });
        placements = [];
        selectedRackIndex = null;
        selectedBoard = null;
        actionsExpanded = false;
        renderGame();
      }
    });
    if (exchangeMode) {
      menuActions.push({
        label: 'Cancel Exchange',
        disabled: !canAct,
        onClick: function () {
          exchangeMode = false;
          exchangeSelected = {};
          actionsExpanded = false;
          renderGame();
        }
      });
    } else {
      menuActions.push({
        label: 'Exchange',
        disabled: !canAct || turnInProgress,
        onClick: function (e) {
          exchangeMode = true;
          exchangeSelected = {};
          brief('Select tiles to swap', e.target);
          actionsExpanded = false;
          renderGame();
        }
      });
    }
    menuActions.push({
      label: 'Resign',
      className: 'danger',
      disabled: !(me && !me.resigned && snapshot.status === 'active'),
      onClick: function (e) {
        if (!confirm('Resign? You can still watch.')) return;
        mutate(function () {
          return ScrabbleAPI.resign({
            code: code,
            token: creds.token,
            expectedVersion: snapshot.version
          }).then(function () {
            brief('Resigned', e.target);
          });
        });
        actionsExpanded = false;
      }
    });
    // Challenge available to any player until the next turn is completed
    if (snapshot.challengeableMoveId && me && !me.resigned) {
      var challengedPlay = (snapshot.moves || []).find(function (m) {
        return m.id === snapshot.challengeableMoveId;
      });
      var isOwnPlay = challengedPlay && Number(challengedPlay.seat) === Number(me.seat);
      menuActions.push({
        label: 'Challenge',
        className: 'danger',
        disabled: !(me.challengesLeft > 0) || !!isOwnPlay,
        onClick: function (e) {
          mutate(function () {
            return ScrabbleAPI.challenge({
              code: code,
              token: creds.token,
              expectedVersion: snapshot.version
            }).then(function (data) {
              brief(
                data && data.outcome === 'success' ? 'Challenge won' : 'Challenge failed',
                e.target
              );
            });
          });
          actionsExpanded = false;
        }
      });
    }
    menuActions.push({
      label: 'Share WhatsApp',
      onClick: function () {
        var text = encodeURIComponent('Scrabble game: ' + window.location.href);
        window.open('https://wa.me/?text=' + text, '_blank');
        actionsExpanded = false;
        renderGame();
      }
    });

    renderActionBar(btns, {
      primary: primary,
      actions: menuActions,
      expanded: actionsExpanded,
      disabled: snapshot.status !== 'active',
      onToggle: function () {
        actionsExpanded = !actionsExpanded;
        renderGame();
      }
    });

    var reasonKey = resolveEndReason(snapshot);
    var reasonText = formatEndReason(reasonKey);
    var banner = $('gameOverBanner');
    var over = $('gameOver');
    if (snapshot.status === 'finished') {
      if (banner) {
        banner.classList.remove('hidden');
        banner.innerHTML =
          '<h2>Game Over</h2><p class="game-over-banner__reason">' +
          reasonText +
          '</p>' +
          formatScoreboardHtml(snapshot.players);
      }
      if (over) {
        over.classList.remove('hidden');
        over.className = 'card game-over';
        over.innerHTML =
          '<h3>Final scores</h3><p class="game-over__reason">' +
          reasonText +
          '</p>' +
          formatScoreboardHtml(snapshot.players);
      }
    } else {
      if (banner) {
        banner.classList.add('hidden');
        banner.innerHTML = '';
      }
      if (over) over.classList.add('hidden');
    }
  }

  function renderAll() {
    if (!snapshot) return;
    if (snapshot.status === 'lobby') renderLobby();
    else renderGame();
  }

  // Boot
  if (creds && creds.token) {
    refresh().catch(function (e) {
      // Token invalid — rejoin
      PlayerStorage.clear(code);
      creds = null;
      showJoin();
      setError(e.message || 'Session expired — join again');
    });
  } else {
    showJoin();
    // Still try public lobby peek? Need token for state — so join only.
  }
}
