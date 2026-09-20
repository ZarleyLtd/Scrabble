/**
 * Format a single move for the Moves list HTML.
 */
export function formatMoveLogEntry(m) {
  if (m.type === 'challenge') {
    // Challenges are shown on the challenged play row
    return '';
  }

  var name = m.name || (m.seat != null ? 'P' + m.seat : '');
  var nameHtml = name ? '<strong>' + name + '</strong> ' : '';

  if (m.type === 'play') {
    var outcome = m.challengeOutcome || m.challenge_outcome;
    var challenger =
      m.challengedByName ||
      m.challenged_by_name ||
      (m.challengedBy != null ? String(m.challengedBy) : '');
    var words = (m.words || [])
      .map(function (w) {
        var word = w.word;
        if (outcome === 'success') {
          return '<span class="move-log__struck">' + word + '</span>';
        }
        return word;
      })
      .join(', ');
    var scoreBit =
      m.score != null
        ? outcome === 'success'
          ? ' <span class="move-log__struck">+' + m.score + '</span>'
          : ' +' + m.score
        : '';
    var challengeBit = challenger
      ? ' <span class="move-log__challenge">{challenged by ' + challenger + '}</span>'
      : '';
    return '<div>' + nameHtml + words + scoreBit + challengeBit + '</div>';
  }

  if (m.type === 'pass') {
    return '<div>' + nameHtml + '{pass}</div>';
  }

  if (m.type === 'exchange') {
    var count = m.count != null ? m.count : m.meta && m.meta.count;
    var label = count != null ? '{exchange ' + count + '}' : '{exchange}';
    return '<div>' + nameHtml + label + '</div>';
  }

  if (m.type === 'resign') {
    return '<div>' + nameHtml + '{resign}</div>';
  }

  if (m.type === 'endgame_adjust') {
    return '<div>{endgame}</div>';
  }

  var outcome2 = m.challenge_outcome || m.outcome;
  return (
    '<div>' +
    nameHtml +
    '{' +
    m.type +
    '}' +
    (outcome2 ? ' (' + outcome2 + ')' : '') +
    '</div>'
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
