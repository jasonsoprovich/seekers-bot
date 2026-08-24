// Read-only D1 queries backing /lookup_characters (PLAN.md §8/§11 Phase 9).
// This repo never writes to the database — schema and migrations are owned
// solely by seekers-tracker (PLAN.md §11 "Repos: ... schema and migrations
// are owned solely by [T]").

export type CharacterRow = {
  name: string;
  charType: "main" | "alt" | "mule";
  level: number;
  status: "active" | "inactive" | "removed";
  charPriority: number | null;
};

export type LookupResult =
  | { kind: "not_found" }
  | { kind: "ambiguous"; matches: string[] }
  | { kind: "found"; displayName: string | null; characters: CharacterRow[] };

const CHARACTER_COLUMNS = `name, char_type as charType, level, status, char_priority as charPriority`;

// Mirrors Toryn's SOS-Bot output shape (PLAN.md §8): every character sharing
// a player, ordered main (priority 0) -> alt (1) -> mule (2), name as
// tiebreak for characters sharing a priority (or predating the backfill,
// where char_priority is still NULL).
export async function lookupCharacters(db: D1Database, rawQuery: string): Promise<LookupResult> {
  const query = rawQuery.trim();
  if (!query) return { kind: "not_found" };

  const exact = await db
    .prepare(`SELECT id, player_id as playerId FROM characters WHERE name = ?1 COLLATE NOCASE LIMIT 1`)
    .bind(query)
    .first<{ id: number; playerId: number | null }>();

  let target = exact;

  if (!target) {
    const candidates = await db
      .prepare(`SELECT id, name, player_id as playerId FROM characters WHERE name LIKE ?1 COLLATE NOCASE ORDER BY name LIMIT 10`)
      .bind(`%${query}%`)
      .all<{ id: number; name: string; playerId: number | null }>();

    const rows = candidates.results ?? [];
    if (rows.length === 0) return { kind: "not_found" };
    if (rows.length > 1) return { kind: "ambiguous", matches: rows.map((r) => r.name) };
    target = rows[0];
  }

  if (target.playerId == null) {
    // Unlinked roster character (pre-Phase-3/10 gap, PLAN.md §16) — no
    // player group to expand, report just this one character.
    const row = await db
      .prepare(`SELECT ${CHARACTER_COLUMNS} FROM characters WHERE id = ?1`)
      .bind(target.id)
      .first<CharacterRow>();
    return { kind: "found", displayName: null, characters: row ? [row] : [] };
  }

  const player = await db
    .prepare(`SELECT display_name as displayName FROM players WHERE id = ?1`)
    .bind(target.playerId)
    .first<{ displayName: string | null }>();

  const grouped = await db
    .prepare(
      `SELECT ${CHARACTER_COLUMNS} FROM characters
       WHERE player_id = ?1
       ORDER BY (char_priority IS NULL), char_priority, name COLLATE NOCASE`,
    )
    .bind(target.playerId)
    .all<CharacterRow>();

  return { kind: "found", displayName: player?.displayName ?? null, characters: grouped.results ?? [] };
}
