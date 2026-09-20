/**
 * Player identity persistence in localStorage.
 */
(function (global) {
  'use strict';

  var PREFIX = 'scrabble_player_';

  function key(code) {
    return PREFIX + String(code || '').toUpperCase();
  }

  var PlayerStorage = {
    save: function (code, player) {
      try {
        localStorage.setItem(
          key(code),
          JSON.stringify({
            playerId: player.id,
            token: player.token,
            seat: player.seat,
            name: player.name
          })
        );
      } catch (e) {}
    },
    load: function (code) {
      try {
        var raw = localStorage.getItem(key(code));
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },
    clear: function (code) {
      try {
        localStorage.removeItem(key(code));
      } catch (e) {}
    }
  };

  global.PlayerStorage = PlayerStorage;
})(typeof window !== 'undefined' ? window : this);
