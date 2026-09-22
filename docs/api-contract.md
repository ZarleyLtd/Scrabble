# Scrabble API contract

Edge Function: `scrabble-api`  
Envelope: `{ "error": string|null, "data": unknown }`  
Schema: `scrabble`

All mutating actions require `token` (player secret from join) except `createGame`.  
Mutations accept `expectedVersion`; mismatch returns HTTP 409 with `{ error, data: { version } }`.

## Actions

### createGame (POST)

```json
{
  "action": "createGame",
  "playerCount": 2,
  "hostName": "Alice",
  "settings": { "challengesPerPlayer": 2, "consecutivePassesToEnd": 1 }
}
```

Returns: `{ game: { id, code, status, playerCount, version }, player: { id, seat, name, token }, shareUrlPath: "game.html?g=XXXX" }`

### joinGame (POST)

```json
{ "action": "joinGame", "code": "XXXX", "name": "Bob" }
```

Claims next free seat. The game stays in `lobby` until the host starts it.  
Returns scoped state + player credentials. No racks, bag, or tokens for other players.

### lookupGame (POST)

```json
{ "action": "lookupGame", "code": "XXXX" }
```

Returns `{ exists, status, playerCount, players: [{ seat, name }] }` when the game exists, or `{ exists: false }`. No racks, bag, or tokens.

### listGames (POST)

```json
{ "action": "listGames", "adminCode": "...." }
```

Admin only. Returns `{ games: [{ code, status, playerCount, createdAt, players: [{ seat, name, score, resigned }] }] }` for `lobby`, `active`, and `finished`. No racks, bag, or tokens.

### reorderSeats (POST)

Host only, while `lobby`. `{ code, token, expectedVersion, order: [playerId, ...] }` from first seat to last.

### startGame (POST)

Host only, when every seat is filled. Deals a full rack to each player in seat order and sets status `active`.

### endGame (POST)

`{ code, token, expectedVersion }`. Any player except the one who played out may close the final-word window. Applies end-of-game scoring.

### state (GET or POST)

Query/body: `code`, `token`  
Returns player-scoped snapshot (own rack, others' tile counts only, board, scores, currentSeat, challengeableMoveId, version, moves summary).

### drawTiles (POST)

Tops rack up to 7 from bag. `{ code, token, expectedVersion }`

### commitMove (POST)

```json
{
  "action": "commitMove",
  "code": "XXXX",
  "token": "...",
  "expectedVersion": 3,
  "placements": [{ "row": 7, "col": 7, "letter": "A", "blank": false }]
}
```

Validates placement, scores, advances turn, sets `challengeableMoveId`.

### pass / exchange / resign (POST)

- `pass`: `{ code, token, expectedVersion }`
- `exchange`: `{ code, token, expectedVersion, tiles: ["A","B"] }` (letters from rack; blanks as `"?"`)
- `resign`: `{ code, token, expectedVersion }`

### challenge (POST)

```json
{ "action": "challenge", "code": "XXXX", "token": "...", "expectedVersion": 4 }
```

Only while `challengeableMoveId` is set and challenger is not the mover.  
Success (invalid words): revert move and clear a pending finish. Failure: decrement `challengesLeft`. A failed challenge on the final word ends the game.

### twoLetterWords (POST)

`{ code, token }` uses that player's rack plus the letters already on the board. `{ letters }` is the same combined pool for local play. Returns `{ words }` — dictionary words of length 2 whose letters are all in that pool. A blank (`?`) can stand in for one missing letter. No racks are returned.

## Realtime

Table `scrabble.game_pulse`: `{ game_id, version, current_seat, status, updated_at }`  
Clients subscribe with filter `game_id=eq.<uuid>`, then call `state` if `version` > local.
