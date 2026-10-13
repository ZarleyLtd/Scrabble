-- Per-player game bank (milliseconds). Null means no bank / unlimited.
alter table scrabble.players
  add column if not exists bank_remaining_ms bigint null;
