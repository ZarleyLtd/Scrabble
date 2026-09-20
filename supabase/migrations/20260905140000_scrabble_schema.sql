-- Scrabble schema: games, players, moves, game_pulse, dictionary

create schema if not exists scrabble;

create table if not exists scrabble.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'lobby'
    check (status in ('lobby', 'active', 'finished')),
  player_count int not null check (player_count between 2 and 4),
  board jsonb not null default '[]'::jsonb,
  bag text not null default '',
  current_seat int not null default 0,
  turn_number int not null default 1,
  challengeable_move_id uuid null,
  consecutive_passes int not null default 0,
  settings jsonb not null default '{}'::jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists games_code_idx on scrabble.games (code);

create table if not exists scrabble.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references scrabble.games (id) on delete cascade,
  seat int not null check (seat >= 0 and seat < 4),
  name text not null,
  token text not null,
  rack text not null default '',
  score int not null default 0,
  challenges_left int not null default 2,
  resigned boolean not null default false,
  is_host boolean not null default false,
  created_at timestamptz not null default now(),
  unique (game_id, seat)
);

create index if not exists players_game_id_idx on scrabble.players (game_id);
create index if not exists players_token_idx on scrabble.players (token);

create table if not exists scrabble.moves (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references scrabble.games (id) on delete cascade,
  seat int null,
  type text not null
    check (type in ('play', 'pass', 'exchange', 'resign', 'challenge', 'endgame_adjust')),
  placements jsonb null,
  words jsonb null,
  score int null,
  rack_before text null,
  drawn text null,
  challenged_by uuid null references scrabble.players (id) on delete set null,
  challenge_outcome text null check (challenge_outcome in ('success', 'failed')),
  meta jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists moves_game_id_idx on scrabble.moves (game_id, created_at);

create table if not exists scrabble.game_pulse (
  game_id uuid primary key references scrabble.games (id) on delete cascade,
  version int not null default 1,
  current_seat int not null default 0,
  status text not null default 'lobby',
  updated_at timestamptz not null default now()
);

create table if not exists scrabble.dictionary (
  word text primary key
);

-- RLS: deny direct access except anon SELECT on game_pulse (Realtime)
alter table scrabble.games enable row level security;
alter table scrabble.players enable row level security;
alter table scrabble.moves enable row level security;
alter table scrabble.game_pulse enable row level security;
alter table scrabble.dictionary enable row level security;

-- No policies on games/players/moves/dictionary → blocked for anon/authenticated via PostgREST
-- Pulse: allow anon to SELECT (Realtime postgres_changes needs SELECT privilege)
drop policy if exists game_pulse_anon_select on scrabble.game_pulse;
create policy game_pulse_anon_select
  on scrabble.game_pulse
  for select
  to anon, authenticated
  using (true);

grant usage on schema scrabble to anon, authenticated, service_role;
grant select on scrabble.game_pulse to anon, authenticated;
grant all on all tables in schema scrabble to service_role;

-- Realtime publication
do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'scrabble'
      and tablename = 'game_pulse'
  ) then
    alter publication supabase_realtime add table scrabble.game_pulse;
  end if;
end $$;
