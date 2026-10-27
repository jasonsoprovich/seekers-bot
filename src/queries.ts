// Every D1 query the bot runs. All of them are reads (enforced by db.ts) and
// all of them stay small: characters (~800 rows) and player_epgp_totals
// (~one row per player) are the only tables touched — never ep_ledger /
// gp_ledger. EP/GP/priority come from player_epgp_totals, the materialized
// standings table seekers-tracker keeps current on every ledger write, so
// the bot shows exactly what /roster shows without re-deriving any EPGP math.
//
// "Active" matches the website's default views: the character's own status
// is active, and its account (if it has one) isn't departed/inactive. The
// NoLooter placeholder row is hidden, same as /roster.

import type { ReadOnlyDb } from "./db";

export type CharacterRow = {
  name: string;
  classId: number;
  level: number;
  charType: "main" | "alt" | "mule";
};

export type FindResult =
  | { kind: "not_found" }
  | { kind: "ambiguous"; matches: string[] }
  | { kind: "found"; name: string; playerId: number | null };

export type StandingRow = {
  playerId: number;
  name: string;
  classId: number;
  ep: number;
  gp: number;
  pr: number;
};

export type Totals = { ep: number; gp: number; pr: number };

const ACTIVE_CHARACTER = `
  c.status = 'active'
  AND (c.player_id IS NULL OR p.status = 'active')
  AND lower(c.name) <> 'nolooter'`;

// Exact (case-insensitive) match first; otherwise a prefix match, then a
// substring match. More than one candidate is reported back rather than
// guessed at.
export async function findCharacter(db: ReadOnlyDb, rawQuery: string): Promise<FindResult> {
  const query = rawQuery.trim();
  if (!query) return { kind: "not_found" };

  const exact = await db
    .prepare(
      `SELECT c.name, c.player_id AS playerId
       FROM characters c LEFT JOIN players p ON p.id = c.player_id
       WHERE c.name = ?1 COLLATE NOCASE AND ${ACTIVE_CHARACTER}
       LIMIT 1`,
    )
    .bind(query)
    .first<{ name: string; playerId: number | null }>();
  if (exact) return { kind: "found", ...exact };

  const pattern = escapeLike(query);
  for (const like of [`${pattern}%`, `%${pattern}%`]) {
    const rows =
      (
        await db
          .prepare(
            `SELECT c.name, c.player_id AS playerId
             FROM characters c LEFT JOIN players p ON p.id = c.player_id
             WHERE c.name LIKE ?1 ESCAPE '\\' AND ${ACTIVE_CHARACTER}
             ORDER BY c.name COLLATE NOCASE
             LIMIT 10`,
          )
          .bind(like)
          .all<{ name: string; playerId: number | null }>()
      ).results ?? [];
    if (rows.length === 1) return { kind: "found", ...rows[0] };
    if (rows.length > 1) return { kind: "ambiguous", matches: rows.map((r) => r.name) };
  }
  return { kind: "not_found" };
}

// Slash-command autocomplete: up to 25 active character names starting with
// what's been typed so far (Discord's own cap on suggestions).
export async function autocompleteCharacterNames(db: ReadOnlyDb, typed: string): Promise<string[]> {
  const rows =
    (
      await db
        .prepare(
          `SELECT c.name
           FROM characters c LEFT JOIN players p ON p.id = c.player_id
           WHERE c.name LIKE ?1 ESCAPE '\\' AND ${ACTIVE_CHARACTER}
           ORDER BY c.name COLLATE NOCASE
           LIMIT 25`,
        )
        .bind(`${escapeLike(typed.trim())}%`)
        .all<{ name: string }>()
    ).results ?? [];
  return rows.map((r) => r.name);
}

export async function findPlayerByDiscordId(
  db: ReadOnlyDb,
  discordId: string,
): Promise<{ id: number; status: "active" | "inactive" | "departed" } | null> {
  return db
    .prepare(`SELECT id, status FROM players WHERE discord_id = ?1 LIMIT 1`)
    .bind(discordId)
    .first<{ id: number; status: "active" | "inactive" | "departed" }>();
}

// The account's active characters, main first (the account's designated
// main, then anything else typed main), then alts, then mules.
export async function getPlayerCharacters(db: ReadOnlyDb, playerId: number): Promise<CharacterRow[]> {
  const rows =
    (
      await db
        .prepare(
          `SELECT c.name, c.class AS classId, c.level, c.char_type AS charType
           FROM characters c JOIN players p ON p.id = c.player_id
           WHERE c.player_id = ?1 AND ${ACTIVE_CHARACTER}
           ORDER BY (c.id = p.main_character_id) DESC,
                    CASE c.char_type WHEN 'main' THEN 0 WHEN 'alt' THEN 1 ELSE 2 END,
                    c.name COLLATE NOCASE`,
        )
        .bind(playerId)
        .all<CharacterRow>()
    ).results ?? [];
  return rows;
}

export async function getSingleCharacter(db: ReadOnlyDb, name: string): Promise<CharacterRow | null> {
  return db
    .prepare(`SELECT name, class AS classId, level, char_type AS charType FROM characters WHERE name = ?1 COLLATE NOCASE`)
    .bind(name)
    .first<CharacterRow>();
}

export async function getPlayerInfo(
  db: ReadOnlyDb,
  playerId: number,
): Promise<{ mainName: string | null; classId: number | null; discordId: string | null } | null> {
  return db
    .prepare(
      `SELECT c.name AS mainName, c.class AS classId, p.discord_id AS discordId
       FROM players p LEFT JOIN characters c ON c.id = p.main_character_id
       WHERE p.id = ?1`,
    )
    .bind(playerId)
    .first<{ mainName: string | null; classId: number | null; discordId: string | null }>();
}

export async function getTotals(db: ReadOnlyDb, playerId: number): Promise<Totals | null> {
  return db
    .prepare(`SELECT ep, gp, priority_rating AS pr FROM player_epgp_totals WHERE player_id = ?1`)
    .bind(playerId)
    .first<Totals>();
}

// Standings: one row per active account, shown under its main, highest
// priority first. `activeWithinDays` keeps out accounts with no EP/GP
// activity in that window, judged by characters.last_activity_at (which
// excludes decay rows — player_epgp_totals.last_activity_at doesn't, so
// every account would look active right after a decay). Returns every
// match; callers slice, so they can also report the total.
export async function getStandings(
  db: ReadOnlyDb,
  opts: { classId?: number; activeWithinDays?: number },
): Promise<StandingRow[]> {
  const since =
    opts.activeWithinDays !== undefined ? Math.floor(Date.now() / 1000) - opts.activeWithinDays * 86_400 : null;
  const rows =
    (
      await db
        .prepare(
          `SELECT p.id AS playerId, mc.name, mc.class AS classId,
                  t.ep, t.gp, t.priority_rating AS pr
           FROM player_epgp_totals t
           JOIN players p ON p.id = t.player_id
           JOIN characters mc ON mc.id = p.main_character_id
           WHERE p.status = 'active'
             AND mc.status = 'active'
             AND lower(mc.name) <> 'nolooter'
             AND (?1 IS NULL OR mc.class = ?1)
             AND (?2 IS NULL OR
                  (SELECT max(c2.last_activity_at) FROM characters c2 WHERE c2.player_id = p.id) >= ?2)
           ORDER BY t.priority_rating DESC, mc.name COLLATE NOCASE`,
        )
        .bind(opts.classId ?? null, since)
        .all<StandingRow>()
    ).results ?? [];
  return rows;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
