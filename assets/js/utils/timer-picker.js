/**
 * Timer preset picker for New Game / Play locally dialogs.
 */
(function (global) {
  'use strict';

  var PRESETS = [
    { id: 'none', label: 'No time limit', turn: 0, game: 0 },
    { id: '10/100', label: '10/100', turn: 10, game: 100 },
    { id: '3/30', label: '3/30', turn: 3, game: 30 },
    { id: '0/60', label: '0/60', turn: 0, game: 60 },
    { id: 'custom', label: 'Custom Timer', custom: true }
  ];

  function fieldsHtml() {
    var buttons = PRESETS.map(function (p, i) {
      return (
        '<button type="button" data-timer="' +
        p.id +
        '" aria-pressed="' +
        (i === 0 ? 'true' : 'false') +
        '">' +
        p.label +
        '</button>'
      );
    }).join('');
    return (
      '<div class="field"><label id="timerLimitLabel">Timer</label>' +
      '<div class="count-picker timer-picker" role="group" aria-labelledby="timerLimitLabel">' +
      buttons +
      '</div></div>' +
      '<div class="timer-custom hidden" id="timerCustom">' +
      '<div class="field"><label for="customTurnMinutes">Minutes per turn (0 = no limit)</label>' +
      '<input id="customTurnMinutes" type="number" min="0" max="999" step="1" value="0" /></div>' +
      '<div class="field"><label for="customGameMinutes">Minutes for the game (0 = no limit)</label>' +
      '<input id="customGameMinutes" type="number" min="0" max="999" step="1" value="0" /></div>' +
      '</div>'
    );
  }

  function clampMinutes(value) {
    var n = parseInt(value, 10);
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(999, n);
  }

  function bind(root) {
    var picker = root.querySelector('.timer-picker');
    var customEl = root.querySelector('#timerCustom');
    var turnEl = root.querySelector('#customTurnMinutes');
    var gameEl = root.querySelector('#customGameMinutes');

    function selectedPreset() {
      var pressed = picker && picker.querySelector('button[aria-pressed="true"]');
      var id = pressed && pressed.getAttribute('data-timer');
      return (
        PRESETS.filter(function (p) {
          return p.id === id;
        })[0] || PRESETS[0]
      );
    }

    function syncCustom() {
      var preset = selectedPreset();
      if (customEl) customEl.classList.toggle('hidden', !preset.custom);
    }

    if (picker) {
      picker.querySelectorAll('button').forEach(function (btn) {
        btn.addEventListener('click', function () {
          picker.querySelectorAll('button').forEach(function (b) {
            b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
          });
          syncCustom();
        });
      });
    }
    syncCustom();

    return {
      getLimits: function () {
        var preset = selectedPreset();
        if (preset.custom) {
          return {
            turnLimitMinutes: clampMinutes(turnEl && turnEl.value),
            gameLimitMinutes: clampMinutes(gameEl && gameEl.value)
          };
        }
        return {
          turnLimitMinutes: preset.turn,
          gameLimitMinutes: preset.game
        };
      }
    };
  }

  global.ScrabbleTimerPicker = {
    fieldsHtml: fieldsHtml,
    bind: bind
  };
})(typeof window !== 'undefined' ? window : this);
