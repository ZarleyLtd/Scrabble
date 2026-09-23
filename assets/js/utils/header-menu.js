/**
 * Scrabble header button: unlock or lock admin mode, and admin actions.
 */
(function (global) {
  'use strict';

  var twoLetterHandler = null;
  var menuOpen = false;
  var twoLetterCloser = null;
  var twoLetterTimer = null;

  function hideTwoLetterPanel() {
    if (twoLetterTimer) {
      clearTimeout(twoLetterTimer);
      twoLetterTimer = null;
    }
    if (twoLetterCloser) {
      document.removeEventListener('click', twoLetterCloser, true);
      twoLetterCloser = null;
    }
    var existing = document.getElementById('twoLetterPanel');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  function titleButton() {
    return document.getElementById('scrabbleTitle');
  }

  function closeMenu() {
    menuOpen = false;
    var menu = document.getElementById('scrabbleHeaderMenu');
    if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
    var btn = titleButton();
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function showTwoLetterPanel(words) {
    hideTwoLetterPanel();
    var panel = document.createElement('div');
    panel.id = 'twoLetterPanel';
    panel.className = 'two-letter-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Two-letter words');
    var list = words && words.length ? words : [];
    var items = list
      .map(function (w) {
        return '<li>' + String(w).replace(/[&<>]/g, '') + '</li>';
      })
      .join('');
    panel.innerHTML =
      '<p class="two-letter-panel__title">2-letter words</p>' +
      (items ? '<ul>' + items + '</ul>' : '<p class="muted">No matching 2-letter words</p>');
    document.body.appendChild(panel);
    twoLetterTimer = window.setTimeout(function () {
      twoLetterTimer = null;
      twoLetterCloser = function () {
        hideTwoLetterPanel();
      };
      document.addEventListener('click', twoLetterCloser, true);
    }, 0);
  }

  function openMenu() {
    closeMenu();
    var btn = titleButton();
    if (!btn) return;
    menuOpen = true;
    btn.setAttribute('aria-expanded', 'true');
    var menu = document.createElement('div');
    menu.id = 'scrabbleHeaderMenu';
    menu.className = 'header-menu';
    menu.setAttribute('role', 'menu');

    function addItem(label, onClick, className) {
      var item = document.createElement('button');
      item.type = 'button';
      item.textContent = label;
      if (className) item.className = className;
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        closeMenu();
        onClick(e);
      });
      menu.appendChild(item);
    }

    var unlocked = global.ScrabbleAdmin && ScrabbleAdmin.isUnlocked();
    addItem(unlocked ? 'Lock Admin Mode' : 'Unlock Admin Mode', function () {
      if (!global.ScrabbleAdmin) return;
      if (ScrabbleAdmin.isUnlocked()) {
        ScrabbleAdmin.lock();
        if (global.BriefMessage) BriefMessage.show('Admin mode locked', btn, { durationMs: 1600 });
      } else {
        ScrabbleAdmin.promptAdmin(btn);
      }
    });
    if (unlocked) {
      addItem('Play locally', function () {
        ScrabbleAdmin.openLocalSetup();
      });
      addItem('View games', function () {
        ScrabbleAdmin.openGameList();
      });
      if (ScrabbleAdmin.gameCode()) {
        addItem(
          'Delete Game',
          function () {
            ScrabbleAdmin.deleteCurrentGame(btn);
          },
          'danger'
        );
      }
    }

    var h1 = btn.parentNode;
    if (h1) h1.appendChild(menu);
  }

  function mount() {
    var btn = titleButton();
    if (!btn || btn.getAttribute('data-header-ready') === '1') {
      return;
    }
    btn.setAttribute('data-header-ready', '1');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-haspopup', 'menu');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menuOpen) closeMenu();
      else openMenu();
    });
    document.addEventListener('click', function () {
      if (menuOpen) closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
  }

  global.ScrabbleHeader = {
    mount: mount,
    setGameActive: function () {},
    setTwoLetterHandler: function (fn) {
      twoLetterHandler = fn;
    },
    openTwoLetters: function (anchor) {
      if (typeof twoLetterHandler === 'function') twoLetterHandler(anchor);
    },
    showTwoLetterPanel: showTwoLetterPanel,
    closeMenu: closeMenu
  };
})(typeof window !== 'undefined' ? window : this);
