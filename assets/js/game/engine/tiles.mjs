/**
 * English Scrabble tile distribution (100 tiles) and point values.
 * Blank is represented as '?' in bags/racks; assigned letter stored separately on board cells.
 */

export const BLANK = '?';
export const RACK_SIZE = 7;
export const BINGO_BONUS = 50;

/** Letter → point value (blank is 0). */
export const TILE_VALUES = Object.freeze({
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8,
  K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1,
  U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10, '?': 0
});

/** Letter → count in a fresh English bag. */
export const TILE_COUNTS = Object.freeze({
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1,
  K: 1, L: 4, M: 2, N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6,
  U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1, '?': 2
});

/** Build a fresh 100-tile bag as an array of letters (including '?'). */
export function createBag() {
  const bag = [];
  for (const [letter, count] of Object.entries(TILE_COUNTS)) {
    for (let i = 0; i < count; i++) bag.push(letter);
  }
  return bag;
}

/** Fisher–Yates shuffle (mutates and returns array). Optional rng: () => [0,1). */
export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

export function createShuffledBag(rng = Math.random) {
  return shuffle(createBag(), rng);
}

/** Point value for a tile character. Blanks always 0 even if assigned a letter elsewhere. */
export function tileValue(letter, isBlank = false) {
  if (isBlank || letter === BLANK) return 0;
  const key = String(letter).toUpperCase();
  return TILE_VALUES[key] != null ? TILE_VALUES[key] : 0;
}

/** Sum of values for tiles in a rack string/array (blanks as '?'). */
export function rackValue(rack) {
  const tiles = typeof rack === 'string' ? rack.split('') : rack;
  return tiles.reduce((sum, t) => sum + tileValue(t), 0);
}

/**
 * Draw up to `count` tiles from bag into rack (both arrays).
 * Returns { rack, bag, drawn }.
 */
export function drawTiles(rack, bag, count) {
  const nextRack = rack.slice();
  const nextBag = bag.slice();
  const drawn = [];
  while (drawn.length < count && nextBag.length > 0) {
    const tile = nextBag.pop();
    drawn.push(tile);
    nextRack.push(tile);
  }
  return { rack: nextRack, bag: nextBag, drawn };
}

/** Top rack up to RACK_SIZE. */
export function refillRack(rack, bag, rackSize = RACK_SIZE) {
  const need = Math.max(0, rackSize - rack.length);
  return drawTiles(rack, bag, need);
}

/**
 * Remove specific tiles from rack (multiset). Returns new rack or null if impossible.
 * `toRemove` is array of letters; use '?' for blanks.
 */
export function removeFromRack(rack, toRemove) {
  const next = rack.slice();
  for (const tile of toRemove) {
    const want = tile === BLANK ? BLANK : String(tile).toUpperCase();
    const idx = next.indexOf(want);
    if (idx < 0) return null;
    next.splice(idx, 1);
  }
  return next;
}

/**
 * Exchange tiles: remove selected from rack, return them to bag, shuffle bag, draw same count.
 * Returns { rack, bag, drawn } or { error }.
 */
export function exchangeTiles(rack, bag, selected, rng = Math.random) {
  if (!selected.length) return { error: 'Select at least one tile to exchange' };
  if (bag.length < selected.length) {
    return { error: 'Not enough tiles in the bag to exchange' };
  }
  const afterRemove = removeFromRack(rack, selected);
  if (!afterRemove) return { error: 'Those tiles are not on your rack' };
  const nextBag = bag.concat(selected.map((t) => (t === BLANK ? BLANK : String(t).toUpperCase())));
  shuffle(nextBag, rng);
  return drawTiles(afterRemove, nextBag, selected.length);
}
