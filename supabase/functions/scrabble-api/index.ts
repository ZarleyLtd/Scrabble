/**
 * Scrabble API — Supabase Edge Function
 * Actions: createGame, joinGame, state, drawTiles, commitMove, pass, exchange, resign, challenge
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

import {
  createEmptyBoard,
  createShuffledBag,
  refillRack,
  exchangeTiles,
  removeFromRack,
  RACK_SIZE,
  BLANK,
  scoreTurn,
  applyEndgameAdjustment,
  shouldEndGame,
} from "../_shared/engine/index.mjs";

const SCHEMA = "scrabble";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function responseJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ok(data: unknown) {
  return responseJson({ error: null, data });
}

function fail(error: string, status = 400, data: unknown = null) {
  return responseJson({ error, data }, status);
}

function errMsg(e: unknown): string {
  if (e == null) return "Unknown error";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  const o = e as { message?: string; error?: string; details?: string; hint?: string };
  if (o.message) return o.message;
  if (o.error) return o.error;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function randomCode(len = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (let i = 0; i < len; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function bagToString(bag: string[]): string {
  return bag.join("");
}

function bagFromString(s: string): string[] {
  return s ? s.split("") : [];
}

function rackToString(rack: string[]): string {
  return rack.join("");
}

function rackFromString(s: string): string[] {
  return s ? s.split("") : [];
}

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text) return {};
  try {
    // Support form-encoded data=...
    if (text.startsWith("data=")) {
      const params = new URLSearchParams(text);
      const raw = params.get("data") || "{}";
      return JSON.parse(raw);
    }
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function sbClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase environment variables");
  return createClient(supabaseUrl, serviceKey, { db: { schema: SCHEMA } });
}

async function pgConnect() {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL") || Deno.env.get("DATABASE_URL") || "";
  if (!dbUrl) throw new Error("Missing SUPABASE_DB_URL");
  const client = new Client(dbUrl);
  await client.connect();
  return client;
}

async function persistPulse(
  client: Client,
  gameId: string,
  version: number,
  seat: number,
  status: string,
) {
  await client.queryArray`
    INSERT INTO scrabble.game_pulse (game_id, version, current_seat, status, updated_at)
    VALUES (${gameId}::uuid, ${version}, ${seat}, ${status}, now())
    ON CONFLICT (game_id) DO UPDATE SET
      version = EXCLUDED.version,
      current_seat = EXCLUDED.current_seat,
      status = EXCLUDED.status,
      updated_at = now()
  `;
}

async function reloadGame(client: Client, code: string) {
  const r = await client.queryObject<Record<string, unknown>>`
    SELECT * FROM scrabble.games WHERE code = ${code.toUpperCase()} LIMIT 1
  `;
  return r.rows[0] || null;
}

async function reloadPlayers(client: Client, gameId: string) {
  const r = await client.queryObject<Record<string, unknown>>`
    SELECT * FROM scrabble.players WHERE game_id = ${gameId}::uuid ORDER BY seat
  `;
  return r.rows;
}

async function reloadMoves(client: Client, gameId: string) {
  const r = await client.queryObject<Record<string, unknown>>`
    SELECT * FROM scrabble.moves WHERE game_id = ${gameId}::uuid ORDER BY created_at
  `;
  return r.rows;
}

function nextSeat(players: Array<{ seat: number; resigned: boolean }>, from: number) {
  const n = Math.max(...players.map((p) => p.seat)) + 1;
  let seat = from;
  for (let i = 0; i < n + 4; i++) {
    seat = (seat + 1) % Math.max(n, 1);
    const p = players.find((x) => x.seat === seat);
    if (p && !p.resigned) return seat;
  }
  return from;
}

function scopedState(
  game: Record<string, unknown>,
  players: Array<Record<string, unknown>>,
  moves: Array<Record<string, unknown>>,
  viewer: Record<string, unknown> | null,
) {
  return {
    gameId: game.id,
    code: game.code,
    status: game.status,
    playerCount: game.player_count,
    board: game.board,
    bagCount: String(game.bag || "").length,
    currentSeat: game.current_seat,
    turnNumber: game.turn_number,
    challengeableMoveId: game.challengeable_move_id,
    consecutivePasses: game.consecutive_passes,
    settings: game.settings,
    version: game.version,
    players: players.map((p) => {
      const isSelf = viewer && p.id === viewer.id;
      return {
        id: p.id,
        seat: p.seat,
        name: p.name,
        score: p.score,
        challengesLeft: p.challenges_left,
        resigned: p.resigned,
        isHost: p.is_host,
        rackCount: String(p.rack || "").length,
        rack: isSelf ? rackFromString(String(p.rack || "")) : undefined,
      };
    }),
    moves: moves.map((m) => {
      const challenger = m.challenged_by
        ? players.find((p) => p.id === m.challenged_by)
        : null;
      return {
        id: m.id,
        type: m.type,
        seat: m.seat,
        name: players.find((p) => p.seat === m.seat)?.name,
        placements: m.placements,
        words: m.words,
        score: m.score,
        rackBefore: m.rack_before,
        drawn: m.drawn,
        challenge_outcome: m.challenge_outcome,
        challenged_by_name: challenger ? challenger.name : undefined,
        meta: m.meta,
        created_at: m.created_at,
      };
    }),
    endReason: (() => {
      for (let i = moves.length - 1; i >= 0; i--) {
        const m = moves[i];
        if (m?.type === "endgame_adjust" && (m.meta as { reason?: string } | null)?.reason) {
          return (m.meta as { reason: string }).reason;
        }
      }
      return null;
    })(),
  };
}

async function createGame(_sb: SupabaseClient, body: Record<string, unknown>) {
  const playerCount = Math.max(2, Math.min(4, Number(body.playerCount) || 2));
  const hostName = String(body.hostName || "").trim();
  if (!hostName) return fail("hostName is required");

  const settings = (body.settings as Record<string, unknown>) || {};
  const challenges =
    Number(settings.challengesPerPlayer) >= 0
      ? Number(settings.challengesPerPlayer)
      : 2;
  const consecutivePassesToEnd =
    Number(settings.consecutivePassesToEnd) >= 1
      ? Number(settings.consecutivePassesToEnd)
      : 1;

  const bag = bagToString(createShuffledBag());
  const board = createEmptyBoard();
  let code = randomCode();
  const token = randomToken();
  const settingsJson = JSON.stringify({
    challengesPerPlayer: challenges,
    consecutivePassesToEnd,
  });

  const client = await pgConnect();
  try {
    for (let i = 0; i < 5; i++) {
      const existing = await reloadGame(client, code);
      if (!existing) break;
      code = randomCode();
    }

    const gameIns = await client.queryObject<Record<string, unknown>>`
      INSERT INTO scrabble.games (
        code, status, player_count, board, bag, current_seat, turn_number, settings, version
      ) VALUES (
        ${code},
        'lobby',
        ${playerCount},
        ${JSON.stringify(board)}::jsonb,
        ${bag},
        0,
        1,
        ${settingsJson}::jsonb,
        1
      )
      RETURNING *
    `;
    const game = gameIns.rows[0];

    const playerIns = await client.queryObject<Record<string, unknown>>`
      INSERT INTO scrabble.players (
        game_id, seat, name, token, rack, score, challenges_left, is_host
      ) VALUES (
        ${game.id}::uuid, 0, ${hostName}, ${token}, '', 0, ${challenges}, true
      )
      RETURNING *
    `;
    const player = playerIns.rows[0];
    await persistPulse(client, String(game.id), 1, 0, "lobby");

    return ok({
      game: {
        id: game.id,
        code: game.code,
        status: game.status,
        playerCount: game.player_count,
        version: game.version,
      },
      player: {
        id: player.id,
        seat: player.seat,
        name: player.name,
        token: player.token,
      },
      shareUrlPath: `game.html?g=${game.code}`,
    });
  } finally {
    await client.end();
  }
}

async function joinGame(_sb: SupabaseClient, body: Record<string, unknown>) {
  const code = String(body.code || "").toUpperCase();
  const name = String(body.name || "").trim();
  if (!code || !name) return fail("code and name are required");

  const client = await pgConnect();
  try {
    await client.queryArray`BEGIN`;
    await client.queryArray`SELECT pg_advisory_xact_lock(hashtext(${"scrabble:" + code}))`;

    const game = await reloadGame(client, code);
    if (!game) {
      await client.queryArray`ROLLBACK`;
      return fail("Game not found", 404);
    }
    if (game.status !== "lobby") {
      await client.queryArray`ROLLBACK`;
      return fail("Game already started");
    }

    const players = await reloadPlayers(client, String(game.id));
    if (players.length >= Number(game.player_count)) {
      await client.queryArray`ROLLBACK`;
      return fail("Game is full");
    }

    const taken = new Set(players.map((p) => Number(p.seat)));
    let seat = 0;
    while (taken.has(seat)) seat++;

    const settings = (game.settings || {}) as Record<string, unknown>;
    const challenges = Number(settings.challengesPerPlayer) >= 0
      ? Number(settings.challengesPerPlayer)
      : 2;
    const token = randomToken();

    const playerIns = await client.queryObject<Record<string, unknown>>`
      INSERT INTO scrabble.players (
        game_id, seat, name, token, rack, challenges_left, is_host
      ) VALUES (
        ${game.id}::uuid, ${seat}, ${name}, ${token}, '', ${challenges}, false
      )
      RETURNING *
    `;
    const player = playerIns.rows[0];
    const allPlayers = [...players, player];
    let status = String(game.status);
    const version = Number(game.version) + 1;

    if (allPlayers.length >= Number(game.player_count)) {
      status = "active";
      await client.queryArray`
        UPDATE scrabble.games SET status = 'active', version = ${version}, updated_at = now()
        WHERE id = ${game.id}::uuid`;
    } else {
      await client.queryArray`
        UPDATE scrabble.games SET version = ${version}, updated_at = now()
        WHERE id = ${game.id}::uuid`;
    }

    await persistPulse(client, String(game.id), version, Number(game.current_seat), status);
    await client.queryArray`COMMIT`;

    const fresh = await reloadGame(client, code);
    const moves = await reloadMoves(client, String(game.id));
    const scoped = scopedState(fresh!, allPlayers, moves, player);
    return ok({
      ...scoped,
      player: { id: player.id, seat: player.seat, name: player.name, token: player.token },
    });
  } catch (e) {
    try {
      await client.queryArray`ROLLBACK`;
    } catch (_) {}
    return fail(errMsg(e), 500);
  } finally {
    await client.end();
  }
}

async function getState(_sb: SupabaseClient, code: string, token: string) {
  const client = await pgConnect();
  try {
    const game = await reloadGame(client, code);
    if (!game) return fail("Game not found", 404);
    const players = await reloadPlayers(client, String(game.id));
    const viewer = players.find((p) => p.token === token);
    if (!viewer) return fail("Invalid player token", 401);
    const moves = await reloadMoves(client, String(game.id));
    return ok(scopedState(game, players, moves, viewer));
  } finally {
    await client.end();
  }
}

function checkTurn(game: Record<string, unknown>, viewer: Record<string, unknown>) {
  if (game.status !== "active") return "Game is not active";
  if (viewer.resigned) return "You have resigned";
  if (viewer.seat !== game.current_seat) return "Not your turn";
  return null;
}

function checkVersion(game: Record<string, unknown>, body: Record<string, unknown>) {
  if (body.expectedVersion != null && Number(body.expectedVersion) !== Number(game.version)) {
    return true;
  }
  return false;
}

async function maybeEndGame(
  client: Client,
  game: Record<string, unknown>,
  players: Array<Record<string, unknown>>,
  finisherSeat: number | null | undefined,
) {
  const settings = (game.settings || {}) as Record<string, unknown>;
  const check = shouldEndGame({
    players: players.map((p) => ({
      seat: Number(p.seat),
      rack: String(p.rack || ""),
      score: Number(p.score),
      resigned: !!p.resigned,
    })),
    bag: bagFromString(String(game.bag || "")),
    consecutivePasses: Number(game.consecutive_passes),
    consecutivePassesToEnd: Number(settings.consecutivePassesToEnd) || 1,
    playedOutSeat: finisherSeat != null ? finisherSeat : null,
  });
  if (!check.end) return { game, players, ended: false };

  const adj = applyEndgameAdjustment(
    players.map((p) => ({
      seat: Number(p.seat),
      rack: String(p.rack || ""),
      score: Number(p.score),
      resigned: !!p.resigned,
    })),
    check.finisherSeat != null ? check.finisherSeat : finisherSeat ?? null,
  );

  for (const a of adj.adjustments) {
    const p = players.find((x) => Number(x.seat) === a.seat)!;
    p.score = Number(p.score) + a.delta;
    await client.queryArray`
      UPDATE scrabble.players SET score = ${p.score} WHERE id = ${p.id}::uuid
    `;
  }

  const version = Number(game.version) + 1;
  await client.queryArray`
    UPDATE scrabble.games SET
      status = 'finished',
      version = ${version},
      challengeable_move_id = null,
      updated_at = now()
    WHERE id = ${game.id}::uuid
  `;
  await client.queryArray`
    INSERT INTO scrabble.moves (game_id, type, meta)
    VALUES (
      ${game.id}::uuid,
      'endgame_adjust',
      ${JSON.stringify({ adjustments: adj.adjustments, reason: check.reason })}::jsonb
    )
  `;
  await persistPulse(client, String(game.id), version, Number(game.current_seat), "finished");
  game.status = "finished";
  game.version = version;
  return { game, players, ended: true };
}

async function mutate(
  code: string,
  token: string,
  body: Record<string, unknown>,
  handler: (
    client: Client,
    game: Record<string, unknown>,
    players: Array<Record<string, unknown>>,
    viewer: Record<string, unknown>,
  ) => Promise<Response>,
) {
  const client = await pgConnect();
  try {
    await client.queryArray`BEGIN`;
    await client.queryArray`SELECT pg_advisory_xact_lock(hashtext(${"scrabble:" + code.toUpperCase()}))`;
    const game = await reloadGame(client, code);
    if (!game) {
      await client.queryArray`ROLLBACK`;
      return fail("Game not found", 404);
    }
    const players = await reloadPlayers(client, String(game.id));
    const viewer = players.find((p) => p.token === token);
    if (!viewer) {
      await client.queryArray`ROLLBACK`;
      return fail("Invalid player token", 401);
    }
    if (checkVersion(game, body)) {
      await client.queryArray`ROLLBACK`;
      return fail("Version conflict", 409, { version: game.version });
    }
    const res = await handler(client, game, players, viewer);
    // handler returns Response; commit if not already failed mid-way — we commit always if handler succeeded without throw
    await client.queryArray`COMMIT`;
    return res;
  } catch (e) {
    try {
      await client.queryArray`ROLLBACK`;
    } catch (_) {}
    const msg = e instanceof Error ? e.message : String(e);
    return fail(msg, 500);
  } finally {
    await client.end();
  }
}

async function doDrawTiles(body: Record<string, unknown>) {
  const code = String(body.code || "");
  const token = String(body.token || "");
  return mutate(code, token, body, async (client, game, players, viewer) => {
    const turnErr = checkTurn(game, viewer);
    if (turnErr) return fail(turnErr);
    // Drawing does not close the challenge window — only completing a turn does
    const rack = rackFromString(String(viewer.rack || ""));
    const bag = bagFromString(String(game.bag || ""));
    const result = refillRack(rack, bag, RACK_SIZE);
    viewer.rack = rackToString(result.rack);
    game.bag = bagToString(result.bag);
    const version = Number(game.version) + 1;
    await client.queryArray`UPDATE scrabble.players SET rack = ${viewer.rack} WHERE id = ${viewer.id}::uuid`;
    await client.queryArray`
      UPDATE scrabble.games SET
        bag = ${game.bag},
        version = ${version},
        updated_at = now()
      WHERE id = ${game.id}::uuid`;
    await persistPulse(client, String(game.id), version, Number(game.current_seat), String(game.status));
    game.version = version;
    const moves = (
      await client.queryObject<Record<string, unknown>>`
        SELECT * FROM scrabble.moves WHERE game_id = ${game.id}::uuid ORDER BY created_at`
    ).rows;
    return ok(scopedState(game, players, moves, viewer));
  });
}

async function doCommitMove(body: Record<string, unknown>) {
  const code = String(body.code || "");
  const token = String(body.token || "");
  const placements = body.placements as Array<{
    row: number;
    col: number;
    letter: string;
    blank?: boolean;
  }>;
  return mutate(code, token, body, async (client, game, players, viewer) => {
    // Clear challenge window if this player is taking an action after previous move
    // (committing is the next action)
    const turnErr = checkTurn(game, viewer);
    if (turnErr) return fail(turnErr);
    if (!placements || !placements.length) return fail("Place at least one tile");

    const board = game.board as Array<Array<{ letter: string; blank: boolean; locked: boolean } | null>>;
    const rack = rackFromString(String(viewer.rack || ""));
    const toRemove = placements.map((p) => (p.blank ? BLANK : String(p.letter).toUpperCase()));
    const nextRack = removeFromRack(rack, toRemove);
    if (!nextRack) return fail("Tiles not on your rack");

    const scored = scoreTurn(board, placements);
    if (!scored.ok) return fail(scored.error || "Illegal placement");

    const rackBefore = rackToString(rack);
    const newBoard = board.map((row) => row.map((c) => (c ? { ...c } : null)));
    for (const p of placements) {
      newBoard[p.row][p.col] = {
        letter: String(p.letter).toUpperCase(),
        blank: !!p.blank,
        locked: true,
      };
    }

    viewer.rack = rackToString(nextRack);
    viewer.score = Number(viewer.score) + scored.total;
    game.board = newBoard;
    game.consecutive_passes = 0;

    // Refill rack from the bag (same as drawTiles / "Get Letter Tiles")
    const bag = bagFromString(String(game.bag || ""));
    const refill = refillRack(rackFromString(viewer.rack), bag, RACK_SIZE);
    viewer.rack = rackToString(refill.rack);
    game.bag = bagToString(refill.bag);

    await client.queryArray`
      UPDATE scrabble.players SET rack = ${viewer.rack}, score = ${viewer.score}
      WHERE id = ${viewer.id}::uuid`;

    const moveIns = await client.queryObject<{ id: string }>`
      INSERT INTO scrabble.moves (game_id, seat, type, placements, words, score, rack_before, drawn)
      VALUES (
        ${game.id}::uuid,
        ${viewer.seat},
        'play',
        ${JSON.stringify(placements)}::jsonb,
        ${JSON.stringify(scored.words.map((w) => ({ word: w.word, score: w.score })))}::jsonb,
        ${scored.total},
        ${rackBefore},
        ${refill.drawn.join("")}
      )
      RETURNING id`;
    const moveId = moveIns.rows[0].id;

    const version = Number(game.version) + 1;
    // Don't advance yet — set challengeable first then advance
    const next = nextSeat(
      players.map((p) => ({ seat: Number(p.seat), resigned: !!p.resigned })),
      Number(game.current_seat),
    );

    await client.queryArray`
      UPDATE scrabble.games SET
        board = ${JSON.stringify(newBoard)}::jsonb,
        bag = ${game.bag},
        consecutive_passes = 0,
        challengeable_move_id = ${moveId}::uuid,
        current_seat = ${next},
        turn_number = ${Number(game.turn_number) + 1},
        version = ${version},
        updated_at = now()
      WHERE id = ${game.id}::uuid`;

    game.challengeable_move_id = moveId;
    game.current_seat = next;
    game.turn_number = Number(game.turn_number) + 1;
    game.version = version;

    // Gone out only if rack is still empty after refill (bag was empty)
    const emptied = String(viewer.rack || "").length === 0;
    const end = await maybeEndGame(
      client,
      game,
      players,
      emptied ? Number(viewer.seat) : null,
    );
    if (!end.ended) {
      await persistPulse(client, String(game.id), version, next, String(game.status));
    }

    const moves = (
      await client.queryObject<Record<string, unknown>>`
        SELECT * FROM scrabble.moves WHERE game_id = ${game.id}::uuid ORDER BY created_at`
    ).rows;

    return ok({
      ...scopedState(end.game, players, moves, viewer),
      move: { id: moveId, score: scored.total, words: scored.words },
      drawn: refill.drawn,
    });
  });
}

async function doPass(body: Record<string, unknown>) {
  const code = String(body.code || "");
  const token = String(body.token || "");
  return mutate(code, token, body, async (client, game, players, viewer) => {
    const turnErr = checkTurn(game, viewer);
    if (turnErr) return fail(turnErr);

    // Next action clears challenge window
    game.challengeable_move_id = null;
    game.consecutive_passes = Number(game.consecutive_passes) + 1;

    await client.queryArray`
      INSERT INTO scrabble.moves (game_id, seat, type)
      VALUES (${game.id}::uuid, ${viewer.seat}, 'pass')`;

    const next = nextSeat(
      players.map((p) => ({ seat: Number(p.seat), resigned: !!p.resigned })),
      Number(game.current_seat),
    );
    const version = Number(game.version) + 1;
    await client.queryArray`
      UPDATE scrabble.games SET
        consecutive_passes = ${game.consecutive_passes},
        challengeable_move_id = null,
        current_seat = ${next},
        turn_number = ${Number(game.turn_number) + 1},
        version = ${version},
        updated_at = now()
      WHERE id = ${game.id}::uuid`;
    game.current_seat = next;
    game.turn_number = Number(game.turn_number) + 1;
    game.version = version;

    const end = await maybeEndGame(client, game, players, null);
    if (!end.ended) {
      await persistPulse(client, String(game.id), version, next, String(game.status));
    }

    const moves = (
      await client.queryObject<Record<string, unknown>>`
        SELECT * FROM scrabble.moves WHERE game_id = ${game.id}::uuid ORDER BY created_at`
    ).rows;
    return ok(scopedState(end.game, players, moves, viewer));
  });
}

async function doExchange(body: Record<string, unknown>) {
  const code = String(body.code || "");
  const token = String(body.token || "");
  const tiles = (body.tiles as string[]) || [];
  return mutate(code, token, body, async (client, game, players, viewer) => {
    const turnErr = checkTurn(game, viewer);
    if (turnErr) return fail(turnErr);
    const rack = rackFromString(String(viewer.rack || ""));
    const bag = bagFromString(String(game.bag || ""));
    const result = exchangeTiles(rack, bag, tiles.map((t) => String(t).toUpperCase() === "BLANK" ? BLANK : String(t)));
    if (result.error) return fail(result.error);

    viewer.rack = rackToString(result.rack);
    game.bag = bagToString(result.bag);
    // Exchange is a turn but does not count toward consecutive-pass game over
    game.challengeable_move_id = null;

    await client.queryArray`
      UPDATE scrabble.players SET rack = ${viewer.rack} WHERE id = ${viewer.id}::uuid`;
    await client.queryArray`
      INSERT INTO scrabble.moves (game_id, seat, type, meta)
      VALUES (${game.id}::uuid, ${viewer.seat}, 'exchange', ${JSON.stringify({ count: tiles.length })}::jsonb)`;

    const next = nextSeat(
      players.map((p) => ({ seat: Number(p.seat), resigned: !!p.resigned })),
      Number(game.current_seat),
    );
    const version = Number(game.version) + 1;
    await client.queryArray`
      UPDATE scrabble.games SET
        bag = ${game.bag},
        challengeable_move_id = null,
        current_seat = ${next},
        turn_number = ${Number(game.turn_number) + 1},
        version = ${version},
        updated_at = now()
      WHERE id = ${game.id}::uuid`;
    game.current_seat = next;
    game.turn_number = Number(game.turn_number) + 1;
    game.version = version;

    await persistPulse(client, String(game.id), version, next, String(game.status));
    const moves = (
      await client.queryObject<Record<string, unknown>>`
        SELECT * FROM scrabble.moves WHERE game_id = ${game.id}::uuid ORDER BY created_at`
    ).rows;
    return ok(scopedState(game, players, moves, viewer));
  });
}

async function doResign(body: Record<string, unknown>) {
  const code = String(body.code || "");
  const token = String(body.token || "");
  return mutate(code, token, body, async (client, game, players, viewer) => {
    if (game.status === "finished") return fail("Game already finished");
    if (viewer.resigned) return fail("Already resigned");
    viewer.resigned = true;
    await client.queryArray`
      UPDATE scrabble.players SET resigned = true WHERE id = ${viewer.id}::uuid`;
    await client.queryArray`
      INSERT INTO scrabble.moves (game_id, seat, type)
      VALUES (${game.id}::uuid, ${viewer.seat}, 'resign')`;

    let version = Number(game.version) + 1;
    let seat = Number(game.current_seat);
    if (seat === Number(viewer.seat) && game.status === "active") {
      seat = nextSeat(
        players.map((p) => ({ seat: Number(p.seat), resigned: !!p.resigned })),
        seat,
      );
    }
    await client.queryArray`
      UPDATE scrabble.games SET
        challengeable_move_id = null,
        current_seat = ${seat},
        version = ${version},
        updated_at = now()
      WHERE id = ${game.id}::uuid`;
    game.current_seat = seat;
    game.version = version;
    game.challengeable_move_id = null;

    const end = await maybeEndGame(client, game, players, null);
    if (!end.ended) {
      await persistPulse(client, String(game.id), version, seat, String(game.status));
    }
    const moves = (
      await client.queryObject<Record<string, unknown>>`
        SELECT * FROM scrabble.moves WHERE game_id = ${game.id}::uuid ORDER BY created_at`
    ).rows;
    return ok(scopedState(end.game, players, moves, viewer));
  });
}

async function doChallenge(sb: SupabaseClient, body: Record<string, unknown>) {
  const code = String(body.code || "");
  const token = String(body.token || "");
  return mutate(code, token, body, async (client, game, players, viewer) => {
    if (!game.challengeable_move_id) return fail("Nothing to challenge");
    if (viewer.resigned) return fail("You have resigned");
    if (Number(viewer.challenges_left) <= 0) return fail("No challenges left");

    const moveR = await client.queryObject<Record<string, unknown>>`
      SELECT * FROM scrabble.moves WHERE id = ${game.challengeable_move_id}::uuid LIMIT 1`;
    const move = moveR.rows[0];
    if (!move || move.type !== "play") return fail("Nothing to challenge");
    if (Number(move.seat) === Number(viewer.seat)) return fail("Cannot challenge your own move");

    const words = (move.words as Array<{ word: string }>) || [];
    const upper = words.map((w) => String(w.word || "").toUpperCase());
    let allValid = true;
    for (const w of upper) {
      const found = await client.queryObject`
        SELECT 1 FROM scrabble.dictionary WHERE word = ${w} LIMIT 1`;
      if (!found.rows.length) {
        allValid = false;
        break;
      }
    }

    // Also fail closed if dictionary empty? Prefer: if no dictionary rows, reject challenge with message
    const countR = await client.queryObject<{ c: number }>`
      SELECT count(*)::int AS c FROM scrabble.dictionary`;
    if ((countR.rows[0]?.c || 0) === 0) {
      return fail("Dictionary not loaded — cannot resolve challenges");
    }

    const version = Number(game.version) + 1;

    if (!allValid) {
      // Success challenge — revert play; challenged player loses the turn
      const board = (game.board as Array<Array<unknown>>).map((row) =>
        row.map((c) => (c ? { ...(c as object) } : null)),
      );
      const placements = (move.placements as Array<{ row: number; col: number }>) || [];
      for (const p of placements) board[p.row][p.col] = null;

      const mover = players.find((p) => Number(p.seat) === Number(move.seat));
      const bag = bagFromString(String(game.bag || ""));
      const drawn = String(move.drawn || "");
      if (drawn) {
        for (const ch of drawn) bag.push(ch);
      }
      game.bag = bagToString(bag);

      if (mover) {
        mover.score = Number(mover.score) - Number(move.score || 0);
        mover.rack = String(move.rack_before || "");
        await client.queryArray`
          UPDATE scrabble.players SET score = ${mover.score}, rack = ${mover.rack}
          WHERE id = ${mover.id}::uuid`;
      }

      // Annotate the play; keep current_seat on the next player (already advanced)
      await client.queryArray`
        UPDATE scrabble.moves SET
          challenge_outcome = 'success',
          challenged_by = ${viewer.id}::uuid
        WHERE id = ${move.id}::uuid`;

      await client.queryArray`
        UPDATE scrabble.games SET
          board = ${JSON.stringify(board)}::jsonb,
          bag = ${game.bag},
          challengeable_move_id = null,
          version = ${version},
          updated_at = now()
        WHERE id = ${game.id}::uuid`;
      game.board = board;
      game.challengeable_move_id = null;
      game.version = version;

      await client.queryArray`
        INSERT INTO scrabble.moves (game_id, seat, type, challenged_by, challenge_outcome)
        VALUES (${game.id}::uuid, ${viewer.seat}, 'challenge', ${viewer.id}::uuid, 'success')`;

      await persistPulse(
        client,
        String(game.id),
        version,
        Number(game.current_seat),
        String(game.status),
      );
      const moves = (
        await client.queryObject<Record<string, unknown>>`
          SELECT * FROM scrabble.moves WHERE game_id = ${game.id}::uuid ORDER BY created_at`
      ).rows;
      return ok({ ...scopedState(game, players, moves, viewer), outcome: "success" });
    }

    // Failed challenge — play stands; challenge window stays open until turn completes
    viewer.challenges_left = Number(viewer.challenges_left) - 1;
    await client.queryArray`
      UPDATE scrabble.players SET challenges_left = ${viewer.challenges_left}
      WHERE id = ${viewer.id}::uuid`;
    await client.queryArray`
      UPDATE scrabble.moves SET
        challenge_outcome = 'failed',
        challenged_by = ${viewer.id}::uuid
      WHERE id = ${move.id}::uuid`;
    await client.queryArray`
      INSERT INTO scrabble.moves (game_id, seat, type, challenged_by, challenge_outcome)
      VALUES (${game.id}::uuid, ${viewer.seat}, 'challenge', ${viewer.id}::uuid, 'failed')`;
    await client.queryArray`
      UPDATE scrabble.games SET version = ${version}, updated_at = now()
      WHERE id = ${game.id}::uuid`;
    game.version = version;
    await persistPulse(client, String(game.id), version, Number(game.current_seat), String(game.status));
    const moves = (
      await client.queryObject<Record<string, unknown>>`
        SELECT * FROM scrabble.moves WHERE game_id = ${game.id}::uuid ORDER BY created_at`
    ).rows;
    return ok({ ...scopedState(game, players, moves, viewer), outcome: "failed" });
  });
}

async function handle(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let sb: SupabaseClient;
  try {
    sb = sbClient();
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }

  const url = new URL(req.url);
  let action = url.searchParams.get("action") || "";
  let body: Record<string, unknown> = {};

  if (req.method === "GET") {
    body = Object.fromEntries(url.searchParams.entries());
  } else if (req.method === "POST") {
    body = await readJsonBody(req);
    action = String(body.action || action || "");
  } else {
    return fail("Method not allowed", 405);
  }

  try {
    switch (action) {
      case "createGame":
        return await createGame(sb, body);
      case "joinGame":
        return await joinGame(sb, body);
      case "state":
        return await getState(sb, String(body.code || ""), String(body.token || ""));
      case "drawTiles":
        return await doDrawTiles(body);
      case "commitMove":
        return await doCommitMove(body);
      case "pass":
        return await doPass(body);
      case "exchange":
        return await doExchange(body);
      case "resign":
        return await doResign(body);
      case "challenge":
        return await doChallenge(sb, body);
      default:
        return fail("Unknown action: " + action);
    }
  } catch (e) {
    return fail(errMsg(e), 500);
  }
}

Deno.serve(handle);
