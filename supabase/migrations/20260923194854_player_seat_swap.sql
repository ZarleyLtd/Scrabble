-- Allow temporary seats 4–7 while the host reorders the lobby.
-- Real seats stay 0–3. The swap parks everyone at seat+4, then writes 0..n-1.

alter table scrabble.players drop constraint if exists players_seat_check;

alter table scrabble.players
  add constraint players_seat_check check (seat >= 0 and seat < 8);
