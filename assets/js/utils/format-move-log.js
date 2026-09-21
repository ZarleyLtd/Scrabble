/**
 * Format a single move for the Moves list HTML.
 */
export function formatMoveLogEntry(m) {
  if (m.type === 'challenge') {
    // Challenges are shown on the challenged play row
    return '';
  }

  var name = m.name || (m.seat != null ? 'P' + m.seat : '');
  var nameHtml = '<span class="move-log__name">' + (name || '') + '</span>';

  function row(detailHtml, scoreHtml) {
    return (
      '<div class="move-log__row">' +
      nameHtml +
      '<span class="move-log__detail">' +
      (detailHtml || '') +
      '</span>' +
      '<span class="move-log__score">' +
      (scoreHtml || '') +
      '</span>' +
      '</div>'
    );
  }

  if (m.type === 'play') {
    var outcome = m.challengeOutcome || m.challenge_outcome;
    var challenger =
      m.challengedByName ||
      m.challenged_by_name ||
      (m.challengedBy != null ? String(m.challengedBy) : '');
    var wordList = m.words || [];
    var hasValidity = wordList.some(function (w) {
      return w && (w.valid === true || w.valid === false || w.invalid === true);
    });
    var words = wordList
      .map(function (w) {
        var word = w.word;
        var failed =
          w.valid === false ||
          w.invalid === true ||
          (outcome === 'success' && !hasValidity);
        if (failed) {
          return '<span class="move-log__struck">' + word + '</span>';
        }
        return word;
      })
      .join(', ');
    var scoreHtml =
      m.score != null
        ? outcome === 'success'
          ? '<span class="move-log__struck">+' + m.score + '</span>'
          : '+' + m.score
        : '';
    var detail = words;
    if (challenger) {
      detail +=
        ' <span class="move-log__challenge">challenged by ' + challenger + '</span>';
    }
    return row(detail, scoreHtml);
  }

  if (m.type === 'pass') {
    return row('{pass}', '');
  }

  if (m.type === 'exchange') {
    var count = m.count != null ? m.count : m.meta && m.meta.count;
    var label = count != null ? '{exchange ' + count + '}' : '{exchange}';
    return row(label, '');
  }

  if (m.type === 'resign') {
    return row('{resign}', '');
  }

  if (m.type === 'endgame_adjust') {
    return (
      '<div class="move-log__row">' +
      '<span class="move-log__name"></span>' +
      '<span class="move-log__detail">{endgame}</span>' +
      '<span class="move-log__score"></span>' +
      '</div>'
    );
  }

  var outcome2 = m.challenge_outcome || m.outcome;
  return row(
    '{' + m.type + '}' + (outcome2 ? ' (' + outcome2 + ')' : ''),
    ''
  );
}

/**
 * Build finishing scoreboard HTML (winner first / highlighted).
 */
export function formatScoreboardHtml(players) {
  var ranked = (players || []).slice().sort(function (a, b) {
    return b.score - a.score;
  });
  if (!ranked.length) return '';
  var top = ranked[0].score;
  return (
    '<ol class="game-over-banner__scores">' +
    ranked
      .map(function (p) {
        var cls = p.score === top ? ' class="game-over-banner__winner"' : '';
        return (
          '<li' +
          cls +
          '><span>' +
          p.name +
          '</span><span>' +
          p.score +
          '</span></li>'
        );
      })
      .join('') +
    '</ol>'
  );
}
