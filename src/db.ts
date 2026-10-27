// Read-only view of the shared D1 database. Wrangler has no read-only D1
// binding, so this is the enforcement point instead of just discipline:
// every query in this repo goes through `prepare` here, and anything that
// isn't a single SELECT is refused before it reaches D1. All SQL in src/ is
// static (user input only ever arrives as bound parameters), so this never
// trips in practice — it exists so a future edit can't quietly add a write.

export type ReadOnlyDb = { prepare(sql: string): D1PreparedStatement };

const WRITE_KEYWORDS = /\b(insert|update|delete|replace|create|drop|alter|attach|detach|pragma|vacuum|reindex)\b/i;

export function readOnly(db: D1Database): ReadOnlyDb {
  return {
    prepare(sql: string) {
      const trimmed = sql.trim().replace(/;$/, "");
      if (!/^select\b/i.test(trimmed) || trimmed.includes(";") || WRITE_KEYWORDS.test(trimmed)) {
        throw new Error("seekers-bot is read-only: refused a non-SELECT statement");
      }
      return db.prepare(trimmed);
    },
  };
}
