/**
 * Bootstrap game.html — local or online.
 */

import { startLocalGamePage } from './game-page.js';
import { startOnlineGamePage } from './online-game-page.js';

function $(id) {
  return document.getElementById(id);
}

var params = new URLSearchParams(window.location.search);
var isLocal = params.get('local') === '1';
var code = (params.get('g') || params.get('code') || '').toUpperCase();

if (isLocal) {
  $('headerMeta').textContent = 'Local game';
  startLocalGamePage($('gameRoot'));
} else if (code) {
  $('headerMeta').textContent = 'Game ' + code;
  startOnlineGamePage({
    code: code,
    joinPanel: $('joinPanel'),
    lobbyPanel: $('lobbyPanel'),
    gameRoot: $('gameRoot'),
    errorEl: $('pageError')
  });
} else {
  $('pageError').textContent = 'Missing game code. Open a share link or start from the home page.';
  $('pageError').classList.remove('hidden');
}
