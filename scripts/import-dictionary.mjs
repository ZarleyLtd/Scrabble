/**
 * Import SOWPODS/CSW word list into scrabble.dictionary.
 *
 * Usage:
 *   set SUPABASE_DB_URL=postgresql://...
 *   node scripts/import-dictionary.mjs
 *
 * Place the word list at data/sowpods.txt (gitignored). One word per line,
 * or CSW export lines whose first token is the word (`AAH an interjection…`).
 * Collins CSW is copyright HarperCollins — for private non-commercial use only.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const filePath = path.join(root, "data", "sowpods.txt");

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Set SUPABASE_DB_URL (or DATABASE_URL) to your Postgres connection string.");
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error("Missing data/sowpods.txt — download a SOWPODS/CSW list and place it there.");
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const words = [
    ...new Set(
      raw
        .split(/\r?\n/)
        .map((line) => {
          const trimmed = line.trim().toUpperCase();
          const match = trimmed.match(/^[A-Z]+/);
          return match ? match[0] : "";
        })
        .filter((w) => w.length > 0),
    ),
  ];

  console.log(`Loaded ${words.length} unique words from data/sowpods.txt`);
  if (words.length < 100000) {
    console.warn("Warning: expected ~180k–280k words for a full Scrabble list.");
  }

  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("create schema if not exists scrabble");
    await client.query(`
      create table if not exists scrabble.dictionary (
        word text primary key
      )
    `);
    await client.query("truncate scrabble.dictionary");

    const batchSize = 1000;
    for (let i = 0; i < words.length; i += batchSize) {
      const batch = words.slice(i, i + batchSize);
      const values = batch.map((_, idx) => `($${idx + 1})`).join(",");
      await client.query(
        `insert into scrabble.dictionary (word) values ${values} on conflict do nothing`,
        batch,
      );
      if ((i / batchSize) % 20 === 0) {
        console.log(`  inserted ${Math.min(i + batchSize, words.length)} / ${words.length}`);
      }
    }

    const { rows } = await client.query("select count(*)::int as c from scrabble.dictionary");
    console.log(`Dictionary rows: ${rows[0].c}`);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
