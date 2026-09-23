/**
 * Supabase Realtime subscription on scrabble.game_pulse.
 */
(function (global) {
  'use strict';

  var channel = null;
  var client = null;
  var heartbeatTimer = null;
  var connected = false;

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

  /**
   * Subscribe to pulse updates for a game.
   * onPulse({ version, current_seat, status })
   * onDisconnectChange(boolean connected)
   */
  function subscribe(gameId, onPulse, onDisconnectChange) {
    unsubscribe();
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
          var row = payload.new || payload.old || {};
          if (typeof onPulse === 'function') onPulse(row, payload.eventType);
        }
      )
      .subscribe(function (status) {
        connected = status === 'SUBSCRIBED';
        if (typeof onDisconnectChange === 'function') onDisconnectChange(connected);
      });

    return { ok: true };
  }

  function unsubscribe() {
    stopHeartbeat();
    if (channel && client) {
      client.removeChannel(channel);
    }
    channel = null;
    connected = false;
  }

  function startHeartbeat(fn, ms) {
    stopHeartbeat();
    var interval = ms || (global.SCRABBLE_CONFIG && SCRABBLE_CONFIG.HEARTBEAT_MS) || 45000;
    heartbeatTimer = setInterval(function () {
      if (!connected && typeof fn === 'function') fn();
    }, interval);
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
    unsubscribe: unsubscribe,
    startHeartbeat: startHeartbeat,
    stopHeartbeat: stopHeartbeat,
    isConnected: isConnected
  };
})(typeof window !== 'undefined' ? window : this);
