-- Hold the game open after a player plays out so the final word can be challenged.

alter table scrabble.games
  add column if not exists pending_finisher_seat int null;
