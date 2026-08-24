// Hand-written, not `wrangler types` output — this session has no Cloudflare
// account access to generate it against. Regenerate with
// `npm run cf-typegen` once deployed, and delete this comment when that
// happens; the shape should come out the same.

interface CloudflareEnv {
  DATABASE: D1Database;
  // Discord Developer Portal -> your app -> General Information -> Public Key.
  // Verifies the Ed25519 signature on every incoming interaction request.
  DISCORD_PUBLIC_KEY: string;
}
