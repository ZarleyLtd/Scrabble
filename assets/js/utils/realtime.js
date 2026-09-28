/**
 * Supabase Realtime subscription on scrabble.game_pulse.
 */
(function (global) {
  'use strict';

  var channel = null;
  var client = null;
  var heartbeatTimer = null;
  var connected = false;
  var pollExhausted = false;
  var pollStartedAt = 0;
  var savedGameId = null;
  var savedOnPulse = null;
  var savedOnDisconnect = null;
  var subEpoch = 0;

  function pollIntervalMs() {
    var cfg = global.SCRABBLE_CONFIG || {};
    return cfg.POLL_DISCONNECTED_MS || 8000;
  }

  function pollMaxMs() {
    var cfg = global.SCRABBLE_CONFIG || {};
    return cfg.POLL_DISCONNECTED_MAX_MS || 120000;
  }

  function pageVisible() {
    return !global.document || global.document.visibilityState !== 'hidden';
  }

  function getClient() {
    var cfg = global.SCRABBLE_CONFIG || {};
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return null;
    if (!global.supabase || !global.supabase.createClient) return null;
    if (!client) {
      client = global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        db: { schema: 'scrabble' },
        realtime: { params: { eventsPerSecond: 5 } }
      });
    }
    return client;
  }

  function detachChannel() {
    if (channel && client) {
      client.removeChannel(channel);
    }
    channel = null;
    connected = false;
  }

  /**
   * Subscribe to pulse updates for a game.
   * onPulse({ version, current_seat, status })
   * onDisconnectChange(boolean connected)
   */
  function subscribe(gameId, onPulse, onDisconnectChange) {
    savedGameId = gameId;
    savedOnPulse = onPulse;
    savedOnDisconnect = onDisconnectChange;
    var epoch = ++subEpoch;
    detachChannel();
    var sb = getClient();
    if (!sb) {
      if (typeof onDisconnectChange === 'function') onDisconnectChange(false);
      return { ok: false, error: 'Realtime not configured' };
    }

    channel = sb
      .channel('pulse:' + gameId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'scrabble',
          table: 'game_pulse',
          filter: 'game_id=eq.' + gameId
        },
        function (payload) {
          if (epoch !== subEpoch) return;
          var row = payload.new || payload.old || {};
          if (typeof savedOnPulse === 'function') savedOnPulse(row, payload.eventType);
        }
      )
      .subscribe(function (status) {
        if (epoch !== subEpoch) return;
        connected = status === 'SUBSCRIBED';
        if (connected) pollExhausted = false;
        if (typeof savedOnDisconnect === 'function') savedOnDisconnect(connected);
      });

    return { ok: true };
  }

  function rejoin() {
    if (!savedGameId) return { ok: false, error: 'No game to rejoin' };
    return subscribe(savedGameId, savedOnPulse, savedOnDisconnect);
  }

  function unsubscribe() {
    stopHeartbeat();
    detachChannel();
  }

  function armHeartbeat(fn, ms, immediate) {
    pollStartedAt = Date.now();
    var interval = ms || pollIntervalMs();
    var max = pollMaxMs();
    if (immediate && !connected && pageVisible() && typeof fn === 'function') fn();
    heartbeatTimer = setInterval(function () {
      if (Date.now() - pollStartedAt >= max) {
        pollExhausted = true;
        stopHeartbeat();
        return;
      }
      if (!connected && pageVisible() && typeof fn === 'function') fn();
    }, interval);
  }

  function startHeartbeat(fn, ms) {
    if (heartbeatTimer || pollExhausted) return;
    if (!pageVisible()) return;
    armHeartbeat(fn, ms, true);
  }

  function restartHeartbeat(fn, ms) {
    pollExhausted = false;
    stopHeartbeat();
    if (!pageVisible() || connected) return;
    armHeartbeat(fn, ms, true);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function isConnected() {
    return connected;
  }

  global.ScrabbleRealtime = {
    subscribe: subscribe,
    rejoin: rejoin,
    unsubscribe: unsubscribe,
    startHeartbeat: startHeartbeat,
    restartHeartbeat: restartHeartbeat,
    stopHeartbeat: stopHeartbeat,
    isConnected: isConnected
  };
})(typeof window !== 'undefined' ? window : this);
