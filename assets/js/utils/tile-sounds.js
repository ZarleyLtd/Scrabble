/**
 * Short synthesized Scrabble-like placement sounds (Web Audio API).
 * Rack = softer wood-in-tray; board = firmer wood-on-board.
 */

var ctx = null;

function audioCtx() {
  if (!ctx) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBurst(ac, time, duration, amp, lowpassHz) {
  var len = Math.max(1, Math.floor(ac.sampleRate * duration));
  var buf = ac.createBuffer(1, len, ac.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.004));
  }
  var src = ac.createBufferSource();
  src.buffer = buf;
  var filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpassHz;
  var gain = ac.createGain();
  gain.gain.setValueAtTime(amp, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  src.start(time);
  src.stop(time + duration);
}

function woodModes(ac, time, modes, ampScale) {
  modes.forEach(function (m) {
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(m.freq, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(m.amp * ampScale, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + m.decay);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(time);
    osc.stop(time + m.decay + 0.02);
  });
}

function playWoodHit(kind) {
  var ac = audioCtx();
  if (!ac) return;
  var t = ac.currentTime + 0.001;
  if (kind === 'rack') {
    noiseBurst(ac, t, 0.028, 0.22, 900);
    woodModes(
      ac,
      t,
      [
        { freq: 280, amp: 0.12, decay: 0.05 },
        { freq: 520, amp: 0.08, decay: 0.04 },
        { freq: 940, amp: 0.04, decay: 0.03 }
      ],
      1
    );
  } else {
    noiseBurst(ac, t, 0.02, 0.32, 1400);
    woodModes(
      ac,
      t,
      [
        { freq: 220, amp: 0.18, decay: 0.09 },
        { freq: 830, amp: 0.1, decay: 0.06 },
        { freq: 1480, amp: 0.06, decay: 0.045 },
        { freq: 2350, amp: 0.035, decay: 0.03 }
      ],
      1
    );
    // light secondary contact
    noiseBurst(ac, t + 0.028, 0.015, 0.12, 1100);
  }
}

export function playRackPlaceSound() {
  playWoodHit('rack');
}

export function playBoardPlaceSound() {
  playWoodHit('board');
}
