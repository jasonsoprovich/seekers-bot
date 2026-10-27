// Hand-written, not `wrangler types` output. Regenerate with
// `npm run cf-typegen` once deployed if you like; the shape should match.

interface CloudflareEnv {
  DATABASE: D1Database;
  // Discord Developer Portal -> your app -> General Information -> Public Key.
  // Verifies the Ed25519 signature on every incoming interaction request.
  DISCORD_PUBLIC_KEY: string;
  // The Seekers of Souls server's ID. Interactions from anywhere else are refused.
  DISCORD_GUILD_ID: string;
  // The "Seeker" role every guild member has — required to use the bot.
  SEEKER_ROLE_ID: string;
  // Comma-separated role IDs that are refused even with Seeker (Orc Pawn,
  // Guest) — same list as seekers-tracker's SEEKERS_DISCORD_DENIED_ROLE_IDS.
  DENIED_ROLE_IDS?: string;
}
