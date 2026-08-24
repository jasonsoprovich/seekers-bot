# seekers-bot

Discord slash-command bot for Seekers of Souls — a Cloudflare Worker, not a
gateway bot. See `../PLAN.md` §8 and §11 Phase 9 for the full design
rationale, and `../seekers-tracker/CLAUDE.md` for how the three repos in
this project fit together.

**This repo never migrates the database.** It binds `DATABASE` read-only
(by discipline — Wrangler has no enforced read-only D1 binding, so every
query in `src/` must simply never be a write) to the same D1 database
`seekers-tracker` owns. Schema and migrations live solely in that repo.

## Why a Worker, not a gateway bot

Discord supports an *Interactions Endpoint URL*: Discord POSTs each slash-
command invocation to an HTTPS endpoint you register, so there's no need to
hold a persistent gateway WebSocket open. That runs fine on Cloudflare
Workers' free tier with a direct D1 binding (no HTTP round-trip through the
website's API). The tradeoff: a Worker can't do anything that requires
*passively* watching a channel (e.g. harvesting main/alt registrations from
messages, which Toryn's old bot did) — see PLAN.md §8's caveat. If that
turns out to be required, it needs a separate, persistently-hosted service.

## Setup

1. **Discord Developer Portal** (https://discord.com/developers/applications):
   create or reuse the guild's application. You need three values from it:
   - **Public Key** (General Information tab) — verifies every incoming
     interaction's Ed25519 signature. Required at runtime.
   - **Application ID** (General Information tab) — only needed to run the
     command-registration script below.
   - **Bot Token** (Bot tab) — same, registration-only. Treat like a
     password; never commit it.

2. **Local dev**: `cp .dev.vars.example .dev.vars` and fill in the three
   values above, then `npm install && npm run dev`. Wrangler prints a local
   URL — Discord can't reach `localhost` directly, so use `wrangler dev
   --remote` or a tunnel (e.g. `cloudflared tunnel`) if you need to actually
   exercise a real Discord round trip during development, otherwise test
   `src/lookup.ts`'s logic directly against local D1.

3. **Register commands** (must be re-run any time `src/commands.ts`
   changes — Discord doesn't pick up changes automatically):
   ```
   DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... npm run register-commands -- --guild <guild_id>
   ```
   Guild-scoped registration (the `--guild` flag) updates instantly — use it
   while iterating. Drop the flag to register globally once stable; global
   commands can take up to an hour to propagate everywhere.

4. **Deploy**: `npx wrangler secret put DISCORD_PUBLIC_KEY` (production
   secret, separate from `.dev.vars`), then `npm run deploy`.

5. **Point Discord at the deployed Worker**: copy the deployed URL (shown
   after `npm run deploy`, or the `workers.dev` URL / custom route from
   `wrangler.jsonc`) into the Developer Portal's **Interactions Endpoint
   URL** field (General Information tab). Discord sends a test `PING`
   immediately on save — the Worker must already be deployed and answering
   before you can save that field.

## Commands

- **`/lookup_characters name:<string>`** — `src/lookup.ts`. Resolves a
  character name to its `players` row (via `characters.player_id`, backfilled
  100% as of PLAN.md Phase 3) and lists every character sharing that player,
  ordered `char_priority` (main 0, alt 1, mule 2) then name — the same
  grouping and ordering Toryn's old `SOS-Bot` produced from `discord_id`
  groupings, so the member-facing output doesn't change shape. An unlinked
  roster character (no `player_id` yet — PLAN.md §16) reports itself alone
  rather than erroring. An ambiguous substring match reports the candidate
  names instead of guessing.

## Adding a command

1. Add its definition to `ALL_COMMANDS` in `src/commands.ts`.
2. Handle it in `src/index.ts`'s `APPLICATION_COMMAND` branch.
3. Re-run `npm run register-commands`.

## Read-budget discipline (PLAN.md §8)

Character lookups must stay indexed, few-row queries (`characters.player_id`
/ `.name`, a handful of rows per invocation) — never a ledger scan. If this
bot ever needs to show EP/GP/priority, it must go through the same cached
totals path `seekers-tracker` uses (`getCachedEpgpTotals`, PLAN.md §6),
never a direct aggregate query against `ep_ledger`/`gp_ledger` from here.
