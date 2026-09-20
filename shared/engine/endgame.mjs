/**
 * End-of-game scoring: player who empties rack gains sum of others' remaining tile values;
 * everyone else subtracts their own remaining tile values.
 */

import { rackValue } from './tiles.mjs';

function rackLen(rack) {
  if (typeof rack === 'string') return rack.length;
  return (rack || []).length;
}

/**
 * @param {Array<{ id?: string, seat: number, rack: string|string[], score: number, resigned?: boolean }>} players
 * @param {number|null} finisherSeat - seat of player who played last tile; null if ended by passes/resign
 * @returns {{ adjustments: Array<{ seat, delta, rackValue }>, players: typeof players }}
 */
export function applyEndgameAdjustment(players, finisherSeat) {
  const active = players.filter((p) => !p.resigned);
  const values = active.map((p) => ({
    seat: p.seat,
    value: rackValue(p.rack)
  }));

  const adjustments = [];
  let othersSum = 0;

  for (const v of values) {
    if (finisherSeat != null && v.seat === finisherSeat) continue;
    othersSum += v.value;
    adjustments.push({ seat: v.seat, delta: -v.value, rackValue: v.value });
  }

  if (finisherSeat != null) {
    const fin = values.find((v) => v.seat === finisherSeat);
    if (fin) {
      adjustments.push({ seat: finisherSeat, delta: othersSum, rackValue: fin.value });
    }
  }

  const nextPlayers = players.map((p) => {
    const adj = adjustments.find((a) => a.seat === p.seat);
    if (!adj) return { ...p };
    return { ...p, score: p.score + adj.delta };
  });

  return { adjustments, players: nextPlayers };
}

/**
 * Whether the game should end.
 * - playedOutSeat: set by caller when a player just emptied their rack by playing
 * - all but one resigned
 * - consecutivePasses >= activePlayerCount * consecutivePassesToEnd
 */
export function shouldEndGame(state) {
  const {
    players,
    consecutivePasses,
    consecutivePassesToEnd = 1,
    playedOutSeat = null
  } = state;

  const active = players.filter((p) => !p.resigned);
  if (active.length <= 1) {
    return { end: true, reason: 'resignations', finisherSeat: null };
  }

  if (playedOutSeat != null) {
    const p = active.find((x) => x.seat === playedOutSeat);
    if (p && rackLen(p.rack) === 0) {
      return { end: true, reason: 'played_out', finisherSeat: playedOutSeat };
    }
  }

  const threshold = active.length * consecutivePassesToEnd;
  if (consecutivePasses >= threshold) {
    return { end: true, reason: 'passes', finisherSeat: null };
  }

  return { end: false };
}
