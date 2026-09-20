/**
 * Home page — create local or online game.
 */
(function () {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  function init() {
    var countEl = $('playerCount');
    var nameEl = $('hostName');
    var errEl = $('onlineError');

    $('btnLocal').addEventListener('click', function () {
      var n = countEl.value || '2';
      var name = (nameEl.value || '').trim();
      var names = [];
      for (var i = 0; i < parseInt(n, 10); i++) {
        names.push(i === 0 && name ? name : 'Player ' + (i + 1));
      }
      window.location.href =
        'game.html?local=1&players=' +
        encodeURIComponent(n) +
        '&names=' +
        encodeURIComponent(names.join(','));
    });

    $('btnOnline').addEventListener('click', function () {
      errEl.classList.add('hidden');
      var name = (nameEl.value || '').trim();
      if (!name) {
        errEl.textContent = 'Enter your name to host an online game.';
        errEl.classList.remove('hidden');
        return;
      }
      if (!window.ScrabbleAPI) {
        errEl.textContent = 'API client missing.';
        errEl.classList.remove('hidden');
        return;
      }
      var btn = $('btnOnline');
      btn.disabled = true;
      ScrabbleAPI.createGame({
        playerCount: parseInt(countEl.value, 10) || 2,
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
          errEl.textContent = e.message || String(e);
          errEl.classList.remove('hidden');
          btn.disabled = false;
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
