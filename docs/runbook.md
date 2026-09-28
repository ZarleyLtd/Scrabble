# Scrabble runbook

## Prerequisites

- Supabase CLI logged in to the shared CursorSites project (`yzyipxvlsoxfphwobfkb`)
- Edge secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`

## Database

This app shares the CursorSites **Apps** Supabase project with other apps (separate schemas; global migration history). Prefer the shared procedure in `../cursor-sites-shared/supabase/SHARED_DATABASE.md`:

1. `supabase migration new <snake_name>` and edit the new file under `supabase/migrations/` (SQL must stay in schema `scrabble`).
2. Apply with the Supabase MCP `apply_migration` tool (or the SQL editor) — **not** `supabase db push`.
3. Commit the local migration file.

`supabase db push` fails when remote history includes other apps’ migrations that are not in this repo. Do not repair those versions as reverted.

## Dictionary (challenges)

1. Obtain a SOWPODS/CSW word list for **private non-commercial** use (Collins CSW is HarperCollins copyright).
2. Save as `data/sowpods.txt` (gitignored). One word per line, or a CSW export whose **first token** is the word (`AAH an interjection…`).
3. Install `pg` if needed: `npm install`
4. Run:

```bash
set SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-....pooler.supabase.com:6543/postgres
node scripts/import-dictionary.mjs
```

## Edge Function

```bash
supabase functions deploy scrabble-api --no-verify-jwt
```

Confirm `assets/js/config/app-config.js`:

- `API_URL` → `https://yzyipxvlsoxfphwobfkb.supabase.co/functions/v1/scrabble-api`
- `SUPABASE_ANON_KEY` → project anon/public key from Dashboard → Settings → API (Realtime only; optional — without it, a visible tab refreshes every 8 seconds for up to 2 minutes, and again after the tab wakes)

Edge Function secrets (shared with other apps on this project): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`.

In Dashboard → Database → Publications, ensure `scrabble.game_pulse` is in `supabase_realtime` (migration adds it).
For Realtime `postgres_changes` on a custom schema, also add `scrabble` under **Settings → API → Exposed schemas** if pulse events do not arrive.

## Frontend

Serve static files (`npx serve .`) or publish to GitHub Pages. Use relative paths.

## Engine sync

After editing `shared/engine/*.mjs`:

```powershell
.\scripts\sync-engine.ps1
node --test tests/engine.test.mjs
```

## Smoke test

1. Open `index.html` → Play locally — draw tiles, place through centre, Done, Pass.
2. Deploy backend → New online game → join from second browser/profile → Realtime updates on Done.
3. Import dictionary → Challenge a nonsense word after a play.
