# Scrabble (CursorSites)

Shared-link multiplayer Scrabble. Static vanilla JS frontend + Supabase Edge Function + Postgres (`scrabble` schema on the shared CursorSites project).

## Local play (Phase 1 — no backend)

```bash
npx serve .
```

Open `index.html`, start a local game, or open `game.html?local=1`.

## Stack

- Frontend: static HTML + vanilla JS
- Backend: Supabase Edge Function `scrabble-api` (service role)
- Live updates: Supabase Realtime on `scrabble.game_pulse` (thin pulse) + scoped `state` fetch
- Rules engine: `shared/engine/` (synced to browser and Edge Function)

## Sync the rules engine

After editing files under `shared/engine/`:

```powershell
.\scripts\sync-engine.ps1
```

## Deploy (backend)

```bash
supabase db push
supabase functions deploy scrabble-api --no-verify-jwt
```

Set Edge secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`.

Point `assets/js/config/app-config.js` at the function URL and anon key (Realtime only).

## Dictionary

Place a SOWPODS/CSW word list at `data/sowpods.txt` (gitignored), then:

```bash
node scripts/import-dictionary.mjs
```

See `docs/api-contract.md` and `docs/runbook.md`.
