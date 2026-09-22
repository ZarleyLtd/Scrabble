/**
 * Home page — New Game and Join Game. Local play lives in admin mode.
 */
(function () {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  function showError(text) {
    var errEl = $('homeError');
    if (!errEl) return;
    if (!text) {
      errEl.textContent = '';
      errEl.classList.add('hidden');
      return;
    }
    errEl.textContent = text;
    errEl.classList.remove('hidden');
  }

  function openNewGame() {
    showError('');
    var last = window.PlayerStorage ? PlayerStorage.lastName() : '';
    ScrabbleAdmin.openDialog(
      '<h2>New Game</h2>' +
        '<div class="field"><label for="playerCount">Number of players</label>' +
        '<select id="playerCount"><option value="2" selected>2</option><option value="3">3</option><option value="4">4</option></select></div>' +
        '<div class="field"><label for="hostName">Your name</label>' +
        '<input id="hostName" type="text" maxlength="24" autocomplete="nickname" value="' +
        ScrabbleAdmin.esc(last) +
        '" /></div>' +
        '<p class="error-banner hidden" id="newGameError"></p>' +
        '<div class="btn-row"><button type="button" class="success" id="btnCreate">Create</button>' +
        '<button type="button" data-dialog-close>Cancel</button></div>',
      function (root) {
        var err = root.querySelector('#newGameError');
        var btn = root.querySelector('#btnCreate');
        var nameEl = root.querySelector('#hostName');
        btn.addEventListener('click', function () {
          err.classList.add('hidden');
          var name = (nameEl.value || '').trim();
          if (!name) {
            err.textContent = 'Enter your name.';
            err.classList.remove('hidden');
            return;
          }
          if (!window.ScrabbleAPI) {
            err.textContent = 'API client missing.';
            err.classList.remove('hidden');
            return;
          }
          btn.disabled = true;
          var count = parseInt(root.querySelector('#playerCount').value, 10) || 2;
          ScrabbleAPI.createGame({
            playerCount: count,
            hostName: name,
            settings: {
              challengesPerPlayer: (SCRABBLE_CONFIG && SCRABBLE_CONFIG.DEFAULT_CHALLENGES) || 2,
              consecutivePassesToEnd: 1
            }
          })
            .then(function (data) {
              PlayerStorage.save(data.game.code, data.player);
              window.location.href = data.shareUrlPath || 'game.html?g=' + encodeURIComponent(data.game.code);
            })
            .catch(function (e) {
              err.textContent = e.message || String(e);
              err.classList.remove('hidden');
              btn.disabled = false;
            });
        });
        nameEl.focus();
      }
    );
  }

  function askJoinName(code) {
    var last = PlayerStorage.lastName();
    ScrabbleAdmin.openDialog(
      '<h2>Join ' +
        ScrabbleAdmin.esc(code) +
        '</h2>' +
        '<div class="field"><label for="joinName">Your name</label>' +
        '<input id="joinName" type="text" maxlength="24" autocomplete="nickname" value="' +
        ScrabbleAdmin.esc(last) +
        '" /></div>' +
        '<p class="error-banner hidden" id="joinNameError"></p>' +
        '<div class="btn-row"><button type="button" class="primary" id="btnClaim">Join</button>' +
        '<button type="button" data-dialog-close>Cancel</button></div>',
      function (root) {
        var err = root.querySelector('#joinNameError');
        var btn = root.querySelector('#btnClaim');
        var nameEl = root.querySelector('#joinName');
        btn.addEventListener('click', function () {
          var name = (nameEl.value || '').trim();
          if (!name) {
            err.textContent = 'Enter your name.';
            err.classList.remove('hidden');
            return;
          }
          btn.disabled = true;
          ScrabbleAPI.joinGame({ code: code, name: name })
            .then(function (data) {
              var player = data.player;
              PlayerStorage.save(code, player);
              window.location.href = 'game.html?g=' + encodeURIComponent(code);
            })
            .catch(function (e) {
              err.textContent = e.message || String(e);
              err.classList.remove('hidden');
              btn.disabled = false;
            });
        });
        nameEl.focus();
      }
    );
  }

  function openJoin() {
    showError('');
    ScrabbleAdmin.openDialog(
      '<h2>Join Game</h2>' +
        '<div class="field"><label for="joinCode">Game code</label>' +
        '<input id="joinCode" type="text" maxlength="8" autocomplete="off" /></div>' +
        '<p class="error-banner hidden" id="joinError"></p>' +
        '<div class="btn-row"><button type="button" class="primary" id="btnLookup">Continue</button>' +
        '<button type="button" data-dialog-close>Cancel</button></div>',
      function (root) {
        var err = root.querySelector('#joinError');
        var btn = root.querySelector('#btnLookup');
        var codeEl = root.querySelector('#joinCode');
        function lookup() {
          err.classList.add('hidden');
          var code = (codeEl.value || '').trim().toUpperCase();
          if (!code) {
            err.textContent = 'Enter a game code.';
            err.classList.remove('hidden');
            return;
          }
          var saved = PlayerStorage.load(code);
          if (saved && saved.token) {
            window.location.href = 'game.html?g=' + encodeURIComponent(code);
            return;
          }
          btn.disabled = true;
          ScrabbleAPI.lookupGame(code)
            .then(function (data) {
              if (!data || !data.exists) {
                err.textContent = 'No game with that code.';
                err.classList.remove('hidden');
                btn.disabled = false;
                return;
              }
              if (data.status && data.status !== 'lobby') {
                err.textContent = 'That game has already started.';
                err.classList.remove('hidden');
                btn.disabled = false;
                return;
              }
              ScrabbleAdmin.closeDialog();
              askJoinName(code);
            })
            .catch(function (e) {
              err.textContent = e.message || String(e);
              err.classList.remove('hidden');
              btn.disabled = false;
            });
        }
        btn.addEventListener('click', lookup);
        codeEl.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') lookup();
        });
        codeEl.focus();
      }
    );
  }

  function init() {
    if (window.ScrabbleHeader) ScrabbleHeader.mount();
    $('btnNew').addEventListener('click', openNewGame);
    $('btnJoin').addEventListener('click', openJoin);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
