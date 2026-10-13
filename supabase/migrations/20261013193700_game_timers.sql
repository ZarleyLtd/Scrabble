-- Turn and game clocks: timestamps plus timeout/forfeit move types.
alter table scrabble.games
  add column if not exists game_started_at timestamptz null,
  add column if not exists turn_started_at timestamptz null;

alter table scrabble.moves drop constraint if exists moves_type_check;
alter table scrabble.moves
  add constraint moves_type_check
  check (type in (
    'play',
    'pass',
    'exchange',
    'resign',
    'challenge',
    'endgame_adjust',
    'forfeit',
    'timeout'
  ));
