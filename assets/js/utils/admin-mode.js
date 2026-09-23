/**
 * Admin unlock (session) plus Play locally and View games dialogs.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'scrabble_admin';

  function $(id) {
    return document.getElementById(id);
  }

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function adminCode() {
    return (global.SCRABBLE_CONFIG && global.SCRABBLE_CONFIG.ADMIN_CODE) || '';
  }

  function isUnlocked() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function unlock() {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch (e) {}
    try {
      global.dispatchEvent(new CustomEvent('scrabble-admin'));
    } catch (e2) {}
  }

  function lock() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    try {
      global.dispatchEvent(new CustomEvent('scrabble-admin'));
    } catch (e2) {}
  }

  function closeDialog() {
    var existing = $('appDialog');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  function openDialog(innerHtml, onReady) {
    closeDialog();
    var root = document.createElement('div');
    root.id = 'appDialog';
    root.className = 'app-dialog';
    root.innerHTML = '<div class="app-dialog__card" role="dialog">' + innerHtml + '</div>';
    document.body.appendChild(root);
    var cancel = root.querySelector('[data-dialog-close]');
    if (cancel) {
      cancel.addEventListener('click', function () {
        closeDialog();
      });
    }
    if (typeof onReady === 'function') onReady(root);
    return root;
  }

  function openLocalSetup() {
    if (!isUnlocked()) return;
    var last = global.PlayerStorage ? PlayerStorage.lastName() : '';
    openDialog(
      '<h2>Play locally</h2>' +
        '<div class="field"><label id="localCountLabel">Number of players</label>' +
        '<div class="count-picker" role="group" aria-labelledby="localCountLabel">' +
        '<button type="button" data-count="2" aria-pressed="true">2</button>' +
        '<button type="button" data-count="3" aria-pressed="false">3</button>' +
        '<button type="button" data-count="4" aria-pressed="false">4</button>' +
        '</div></div>' +
        '<div id="localNames"></div>' +
        '<p class="error-banner hidden" id="localSetupError"></p>' +
        '<div class="btn-row"><button type="button" class="primary" id="btnLocalStart">Start</button>' +
        '<button type="button" data-dialog-close>Cancel</button></div>',
      function (root) {
        var namesEl = root.querySelector('#localNames');

        function selectedCount() {
          var pressed = root.querySelector('.count-picker button[aria-pressed="true"]');
          return parseInt(pressed && pressed.getAttribute('data-count'), 10) || 2;
        }

        function renderNames() {
          var n = selectedCount();
          var existing = [];
          namesEl.querySelectorAll('input').forEach(function (input) {
            existing.push(input.value);
          });
          var html = '';
          for (var i = 0; i < n; i++) {
            var value = existing[i] != null ? existing[i] : i === 0 ? last : 'Player ' + (i + 1);
            html +=
              '<div class="field"><label for="localName' +
              i +
              '">Player ' +
              (i + 1) +
              '</label><input id="localName' +
              i +
              '" type="text" maxlength="24" value="' +
              esc(value) +
              '" /></div>';
          }
          namesEl.innerHTML = html;
        }

        root.querySelectorAll('.count-picker button').forEach(function (countBtn) {
          countBtn.addEventListener('click', function () {
            root.querySelectorAll('.count-picker button').forEach(function (b) {
              b.setAttribute('aria-pressed', b === countBtn ? 'true' : 'false');
            });
            renderNames();
          });
        });
        renderNames();

        root.querySelector('#btnLocalStart').addEventListener('click', function () {
          var n = selectedCount();
          var names = [];
          for (var i = 0; i < n; i++) {
            var input = root.querySelector('#localName' + i);
            var name = input ? input.value.trim() : '';
            names.push(name || 'Player ' + (i + 1));
          }
          if (global.PlayerStorage) PlayerStorage.rememberName(names[0]);
          global.location.href =
            'game.html?local=1&players=' +
            encodeURIComponent(String(n)) +
            '&names=' +
            encodeURIComponent(names.join(','));
        });
      }
    );
  }

  function statusTitle(status) {
    if (status === 'active') return 'Active';
    if (status === 'finished') return 'Finished';
    if (status === 'lobby') return 'Lobby';
    return status ? String(status) : 'Other';
  }

  function openGameList() {
    if (!isUnlocked()) return;
    openDialog(
      '<h2>Games</h2><p class="muted" id="gameListStatus">Loading…</p><div id="gameList"></div>' +
        '<div class="btn-row"><button type="button" data-dialog-close>Close</button></div>',
      function (root) {
        var statusEl = root.querySelector('#gameListStatus');
        var listEl = root.querySelector('#gameList');
        if (!global.ScrabbleAPI) {
          statusEl.textContent = 'API client missing.';
          return;
        }
        ScrabbleAPI.listGames(adminCode())
          .then(function (data) {
            var games = (data && data.games) || [];
            if (!games.length) {
              statusEl.textContent = 'No games yet.';
              return;
            }
            statusEl.textContent = '';
            var order = ['active', 'lobby', 'finished'];
            var groups = {};
            games.forEach(function (g) {
              var key = order.indexOf(g.status) >= 0 ? g.status : 'other';
              if (!groups[key]) groups[key] = [];
              groups[key].push(g);
            });
            var keys = order.filter(function (k) {
              return groups[k] && groups[k].length;
            });
            if (groups.other) keys.push('other');
            listEl.innerHTML = keys
              .map(function (key) {
                var rows = groups[key]
                  .map(function (g) {
                    var players = (g.players || [])
                      .map(function (p) {
                        return esc(p.name) + ' ' + (p.score != null ? p.score : 0);
                      })
                      .join(', ');
                    return (
                      '<li class="game-list__row"><a href="game.html?g=' +
                      encodeURIComponent(g.code) +
                      '">' +
                      esc(g.code) +
                      '</a><span class="muted">' +
                      (players || 'No players') +
                      '</span></li>'
                    );
                  })
                  .join('');
                return '<h3>' + esc(statusTitle(key === 'other' ? '' : key)) + '</h3><ul class="game-list">' + rows + '</ul>';
              })
              .join('');
          })
          .catch(function (e) {
            statusEl.textContent = e.message || String(e);
          });
      }
    );
  }

  function currentGameCode() {
    try {
      var params = new URLSearchParams(global.location.search);
      if (params.get('local') === '1') return '';
      return (params.get('g') || params.get('code') || '').toUpperCase();
    } catch (e) {
      return '';
    }
  }

  function confirmAction(title, message, confirmLabel, onConfirm) {
    openDialog(
      '<h2>' +
        esc(title) +
        '</h2><p>' +
        esc(message) +
        '</p><div class="btn-row"><button type="button" class="danger" id="btnConfirmAction">' +
        esc(confirmLabel) +
        '</button><button type="button" data-dialog-close>Go back</button></div>',
      function (root) {
        var btn = root.querySelector('#btnConfirmAction');
        if (!btn) return;
        btn.addEventListener('click', function () {
          closeDialog();
          if (typeof onConfirm === 'function') onConfirm();
        });
      }
    );
  }

  function deleteCurrentGame(anchorEl) {
    if (!isUnlocked()) return;
    var code = currentGameCode();
    if (!code) {
      if (global.BriefMessage) BriefMessage.show('No game to delete', anchorEl, { durationMs: 1600 });
      return;
    }
    if (!global.ScrabbleAPI) return;
    confirmAction('Delete game', 'Delete game ' + code + '? This cannot be undone.', 'Delete game', function () {
    ScrabbleAPI.deleteGame({ code: code, adminCode: adminCode() })
      .then(function () {
        if (global.PlayerStorage) PlayerStorage.clear(code);
        global.location.href = 'index.html';
      })
      .catch(function (e) {
        if (global.BriefMessage) {
          BriefMessage.show(e.message || 'Could not delete game', anchorEl, { durationMs: 2000 });
        }
      });
    });
  }

  function promptAdmin(anchorEl) {
    if (isUnlocked()) return;
    openDialog(
      '<h2>Admin</h2>' +
        '<div class="field"><label for="adminCodeInput">Secret code</label>' +
        '<input id="adminCodeInput" type="text" maxlength="12" autocomplete="off" /></div>' +
        '<div class="btn-row"><button type="button" class="primary" id="btnAdminUnlock">Unlock</button>' +
        '<button type="button" data-dialog-close>Cancel</button></div>',
      function (root) {
        var input = root.querySelector('#adminCodeInput');
        var btn = root.querySelector('#btnAdminUnlock');
        function tryUnlock() {
          if (String(input.value || '').trim() !== adminCode()) {
            if (global.BriefMessage) BriefMessage.show('Incorrect code', anchorEl || btn, { durationMs: 1400 });
            return;
          }
          unlock();
          closeDialog();
          if (global.BriefMessage) BriefMessage.show('Admin mode unlocked', anchorEl, { durationMs: 1600 });
        }
        btn.addEventListener('click', tryUnlock);
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') tryUnlock();
        });
        input.focus();
      }
    );
  }

  global.ScrabbleAdmin = {
    isUnlocked: isUnlocked,
    unlock: unlock,
    lock: lock,
    code: adminCode,
    openLocalSetup: openLocalSetup,
    openGameList: openGameList,
    gameCode: currentGameCode,
    confirmAction: confirmAction,
    deleteCurrentGame: deleteCurrentGame,
    promptAdmin: promptAdmin,
    closeDialog: closeDialog,
    openDialog: openDialog,
    esc: esc
  };
})(typeof window !== 'undefined' ? window : this);
