/**
 * Brief message — ephemeral anchored UI feedback (CursorSites shared pattern).
 * Canonical source: cursor-sites-shared/ui/brief-message.js
 */
(function (global) {
  'use strict';

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function showBriefMessage(text, anchorEl, options) {
    options = options || {};
    var duration = options.durationMs != null ? options.durationMs : 1000;
    var placement = options.placement || 'above';
    var disableEl = options.disableElement != null ? options.disableElement : null;

    var msg = document.createElement('div');
    var className =
      'brief-message brief-message--' + (placement === 'below' ? 'below' : 'above');
    if (options.multiline) {
      className += ' brief-message--multiline';
    }
    msg.className = className;
    msg.setAttribute('role', 'status');
    msg.setAttribute('aria-live', 'polite');
    msg.innerHTML =
      '<span class="brief-message__text">' + escapeHtml(text) + '</span>';
    document.body.appendChild(msg);

    if (anchorEl && typeof anchorEl.getBoundingClientRect === 'function') {
      var rect = anchorEl.getBoundingClientRect();
      var centerX = rect.left + rect.width / 2;
      msg.style.top = (rect.top - 8) + 'px';
      msg.style.left = centerX + 'px';
      var msgRect = msg.getBoundingClientRect();
      var pad = 8;
      var left = centerX;
      if (msgRect.left < pad) {
        left = left + (pad - msgRect.left);
      } else if (msgRect.right > global.innerWidth - pad) {
        left = left - (msgRect.right - (global.innerWidth - pad));
      }
      msg.style.left = left + 'px';
      if (placement === 'above' && msgRect.top < pad) {
        msg.style.top = (rect.bottom + 8) + 'px';
        msg.classList.remove('brief-message--above');
        msg.classList.add('brief-message--below');
      }
    } else {
      msg.style.top = '25%';
      msg.style.left = '50%';
    }

    if (disableEl) disableEl.disabled = true;
    global.setTimeout(function () {
      if (msg.parentNode) msg.parentNode.removeChild(msg);
      if (disableEl) disableEl.disabled = false;
    }, duration);
  }

  function BriefMessage(text, anchorEl, options) {
    return showBriefMessage(text, anchorEl, options);
  }
  BriefMessage.show = showBriefMessage;

  global.BriefMessage = BriefMessage;
})(typeof window !== 'undefined' ? window : globalThis);
