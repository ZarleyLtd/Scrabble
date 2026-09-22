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
      if (res.status === 409) {
        var err = new Error((json && json.error) || 'Version conflict');
        err.code = 409;
        err.data = json && json.data;
        throw err;
      }
      if (!res.ok) {
        throw new Error((json && (json.error || json.message)) || 'Request failed (' + res.status + ')');
      }
      if (json && json.error) throw new Error(json.error);
      return json.data;
    });
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
