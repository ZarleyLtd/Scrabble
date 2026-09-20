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

Claims next free seat. When last seat fills, status becomes `active`.  
Returns scoped state + player credentials.

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
Success (invalid words): revert move. Failure: decrement `challengesLeft`.

## Realtime

Table `scrabble.game_pulse`: `{ game_id, version, current_seat, status, updated_at }`  
Clients subscribe with filter `game_id=eq.<uuid>`, then call `state` if `version` > local.
