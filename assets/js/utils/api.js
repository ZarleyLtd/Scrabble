/**
 * Scrabble API client — Supabase Edge Function.
 */
(function (global) {
  'use strict';

  function baseUrl() {
    var c = global.SCRABBLE_CONFIG || {};
    return c.API_URL || '';
  }

  function parseJsonResponse(res) {
    return res.json().then(function (json) {
      if (!res.ok || (json && json.error)) {
        var err = new Error(
          (json && (json.error || json.message)) || 'Request failed (' + res.status + ')'
        );
        err.status = res.status;
        if (res.status === 409) {
          err.code = 409;
          err.data = json && json.data;
        }
        throw err;
      }
      return json.data;
    });
  }

  function isNoSuchPlayer(e) {
    return !!(e && /no player with that name/i.test(e.message || ''));
  }

  function get(action, params) {
    var url = new URL(baseUrl());
    url.searchParams.set('action', action);
    if (params) {
      Object.keys(params).forEach(function (k) {
        if (params[k] != null) url.searchParams.set(k, params[k]);
      });
    }
    return fetch(url.toString(), {
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'application/json' }
    }).then(parseJsonResponse);
  }

  function post(action, body) {
    var payload = Object.assign({ action: action }, body || {});
    return fetch(baseUrl(), {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    }).then(parseJsonResponse);
  }

  global.ScrabbleAPI = {
    createGame: function (body) {
      return post('createGame', body);
    },
    joinGame: function (body) {
      return post('joinGame', body);
    },
    reclaimSeat: function (body) {
      return post('reclaimSeat', body);
    },
    /** Reclaim an existing seat by name, or claim a free lobby seat when the name is new. */
    reclaimOrJoin: function (code, name) {
      return post('reclaimSeat', { code: code, name: name }).catch(function (e) {
        if (!isNoSuchPlayer(e)) throw e;
        return post('lookupGame', { code: code }).then(function (data) {
          var seated = data && data.players ? data.players.length : 0;
          var openLobby =
            data && data.exists && data.status === 'lobby' && seated < Number(data.playerCount);
          if (!openLobby) throw e;
          return post('joinGame', { code: code, name: name });
        });
      });
    },
    cancelGame: function (body) {
      return post('cancelGame', body);
    },
    state: function (code, token) {
      return get('state', { code: code, token: token });
    },
    drawTiles: function (body) {
      return post('drawTiles', body);
    },
    commitMove: function (body) {
      return post('commitMove', body);
    },
    pass: function (body) {
      return post('pass', body);
    },
    exchange: function (body) {
      return post('exchange', body);
    },
    resign: function (body) {
      return post('resign', body);
    },
    challenge: function (body) {
      return post('challenge', body);
    },
    lookupGame: function (code) {
      return post('lookupGame', { code: code });
    },
    listGames: function (adminCode) {
      return post('listGames', { adminCode: adminCode });
    },
    deleteGame: function (body) {
      return post('deleteGame', body);
    },
    reorderSeats: function (body) {
      return post('reorderSeats', body);
    },
    startGame: function (body) {
      return post('startGame', body);
    },
    endGame: function (body) {
      return post('endGame', body);
    },
    twoLetterWords: function (body) {
      return post('twoLetterWords', body);
    }
  };
})(typeof window !== 'undefined' ? window : this);
