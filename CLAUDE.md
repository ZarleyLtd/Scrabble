# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Multiplayer Scrabble where players join a game through a shared link. The frontend is static HTML with vanilla JS. The backend is the Supabase Edge Function `scrabble-api` (running with the service role) over Postgres schema `scrabble`, on the shared CursorSites **Apps** project (`yzyipxvlsoxfphwobfkb`). Live updates use Supabase Realtime: the function writes a thin pulse row to `scrabble.game_pulse`, and on each pulse the client fetches its own scoped `state`. The API is documented in `docs/api-contract.md` and operations in `docs/runbook.md`.

## Dev server / port

```powershell
npm run serve                  # npx serve . → http://localhost:3000
# alternative: python -m http.server 5174  → http://localhost:5174
```

`serve.json` sets `cleanUrls: false` so that `game.html?…` query strings survive (serve's default clean-URL rewrite drops them). To play locally with no backend, open `index.html` and start a local game, or go to `game.html?local=1` directly.

## Commands

```powershell
npm install
npm run test:engine                                        # node --test tests/engine.test.mjs
node --test --test-name-pattern "<name>" tests/engine.test.mjs   # single test
npm run sync:engine                                        # = scripts/sync-engine.ps1
npm run import:dictionary                                  # needs data/sowpods.txt (gitignored) + SUPABASE_DB_URL
supabase functions deploy scrabble-api --no-verify-jwt
```

The Edge Function needs these secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL`. `assets/js/config/app-config.js` holds the function URL and the anon key, which is used for Realtime only.

## Architecture

- **Rules engine:** `shared/engine/*.mjs` (board, placement, scoring, words, tiles, endgame, timer) is the **canonical** copy. `scripts/sync-engine.ps1` copies it to `assets/js/game/engine/` for the browser and to `supabase/functions/_shared/engine/` for the Edge Function. **Never edit those two copies by hand.** Edit `shared/engine/`, then run the sync.
- **Server authority:** the engine in the browser only previews moves. Every move is committed through the Edge Function, which validates it again.
- **Secrecy:** never send another player's rack or the bag order to a client. State responses are scoped to the requesting player by their token.
- **Frontend modules:** `assets/js/config/` → `utils/` (`api.js`, `brief-message.js`, `player-storage.js`) → `components/` (board, rack, lobby) → `pages/` (index, game) → main/bootstrap. Scripts load in that order, though the engine modules may use ES `import`. Never duplicate code between pages; put shared code in utils or components.
- **Fetch / CORS:** use GET with no custom headers, or POST with `Content-Type: text/plain;charset=UTF-8` and a JSON string body (as theConfessional does), so the browser doesn't send a preflight request.
- **Brief message (a shared CursorSites pattern):** the spec is `../cursor-sites-shared/ui/BRIEF_MESSAGE.md`, synced by `../cursor-sites-shared/scripts/sync-ui.ps1`. Show one with `BriefMessage.show(text, anchorEl, options)` from `assets/js/utils/brief-message.js`; its styles are in `assets/css/brief-message.css`.

## Rules

- Use relative paths only. Never write `http://localhost` or a drive letter such as `C:/Users/` into source.
- The dictionary is a SOWPODS/CSW word list, licensed for private non-commercial use only. `data/sowpods.txt` is gitignored; never commit it.

## Shared Supabase database (important)

The Apps project is shared with other CursorSites apps. Each app has its own schema, but there is one **global** migration history.

- **Never run `supabase db push`.** The README still lists it, but this rule overrides the README. Also never repair or revert other apps' remote migration versions.
- To change the schema:
  1. Run `supabase migration new <name>`.
  2. Write SQL in the new file that touches only `scrabble.*`.
  3. Apply the same SQL with the MCP tool `apply_migration` on project `yzyipxvlsoxfphwobfkb`.
  4. Check the result with `execute_sql`.
  5. Commit the migration file.
- Deploying the Edge Function doesn't depend on migration history.
- The full procedure is in `../cursor-sites-shared/supabase/SHARED_DATABASE.md`.
