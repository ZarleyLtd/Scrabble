/**
 * Human-readable end-of-game reasons.
 */
var REASON_COPY = {
  passes: 'All players passed',
  played_out: 'All tiles played',
  resignations: 'Not enough players remaining'
};

export function formatEndReason(reason) {
  if (!reason) return 'The game has ended';
  if (REASON_COPY[reason]) return REASON_COPY[reason];
  return String(reason).replace(/_/g, ' ');
}

/**
 * Prefer explicit endReason; otherwise read endgame_adjust move meta.
 */
export function resolveEndReason(stateOrSnapshot) {
  if (!stateOrSnapshot) return null;
  if (stateOrSnapshot.endReason) return stateOrSnapshot.endReason;
  var moves = stateOrSnapshot.moves || [];
  for (var i = moves.length - 1; i >= 0; i--) {
    var m = moves[i];
    if (m && m.type === 'endgame_adjust' && m.meta && m.meta.reason) {
      return m.meta.reason;
    }
  }
  return null;
}
