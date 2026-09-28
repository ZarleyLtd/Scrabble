-- Forfeit the next turn after a failed challenge when none remain.
alter table scrabble.players
  add column if not exists skip_next_turn boolean not null default false;
