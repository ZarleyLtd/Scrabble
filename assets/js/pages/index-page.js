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
        '<div class="field"><label id="playerCountLabel">Number of players</label>' +
        '<div class="count-picker" role="group" aria-labelledby="playerCountLabel">' +
        '<button type="button" data-count="2" aria-pressed="true">2</button>' +
        '<button type="button" data-count="3" aria-pressed="false">3</button>' +
        '<button type="button" data-count="4" aria-pressed="false">4</button>' +
        '</div></div>' +
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
        root.querySelectorAll('.count-picker button').forEach(function (countBtn) {
          countBtn.addEventListener('click', function () {
            root.querySelectorAll('.count-picker button').forEach(function (b) {
              b.setAttribute('aria-pressed', b === countBtn ? 'true' : 'false');
            });
          });
        });
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
          var pressed = root.querySelector('.count-picker button[aria-pressed="true"]');
          var count = parseInt(pressed && pressed.getAttribute('data-count'), 10) || 2;
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
          ScrabbleAPI.reclaimOrJoin(code, name)
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
          btn.disabled = true;
          var saved = PlayerStorage.load(code);
          function afterLookup(data) {
            if (!data || !data.exists) {
              if (saved) PlayerStorage.clear(code);
              err.textContent = 'No game with that code.';
              err.classList.remove('hidden');
              btn.disabled = false;
              return;
            }
            ScrabbleAdmin.closeDialog();
            askJoinName(code);
          }
          if (saved && saved.token) {
            ScrabbleAPI.state(code, saved.token)
              .then(function () {
                window.location.href = 'game.html?g=' + encodeURIComponent(code);
              })
              .catch(function (e) {
                if (e.status === 401) {
                  PlayerStorage.clear(code);
                  saved = null;
                  return ScrabbleAPI.lookupGame(code)
                    .then(afterLookup)
                    .catch(function (err2) {
                      err.textContent = err2.message || String(err2);
                      err.classList.remove('hidden');
                      btn.disabled = false;
                    });
                }
                if (e.status === 404) {
                  PlayerStorage.clear(code);
                  err.textContent = 'No game with that code.';
                  err.classList.remove('hidden');
                  btn.disabled = false;
                  return;
                }
                err.textContent = e.message || String(e);
                err.classList.remove('hidden');
                btn.disabled = false;
              });
            return;
          }
          ScrabbleAPI.lookupGame(code)
            .then(afterLookup)
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
