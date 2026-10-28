# seekers-bot

Read-only Discord slash-command bot for Seekers of Souls: a Cloudflare
Worker (Interactions Endpoint, not a gateway bot), sibling repo to
**seekers-tracker** (`../seekers-tracker` — the guild's website, which owns
the D1 schema this repo reads from). Read that repo's `CLAUDE.md` for the
full three-repo picture. `README.md` here has the commands, access rules and
setup/deploy steps; this file is decisions and gotchas.

## Ground rules (leader decisions, 2026-10-27)

- **Informational only.** Every command is a read. Adding/editing mains,
  alts and mules happens on the website, never here. `src/db.ts` refuses
  any non-`SELECT` statement — don't loosen it.
- **This repo never owns schema or migrations.** No `migrations_dir` in
  `wrangler.jsonc` on purpose.
- **Every reply is ephemeral** and sends `allowed_mentions: { parse: [] }`.
- **Access = website's rule**: in the guild, has Seeker, has neither Orc Pawn
  nor Guest (`src/access.ts`; IDs are secrets, missing config fails closed).
  Any member may see any other member's EPGP.
- **Only active** characters (`characters.status`) on active accounts
  (`players.status`), NoLooter hidden — same as `/roster`'s default view.
- Dropped from the old SOS-Bot (khandyman/SOS-Bot, Python, MySQL on a VPS):
  `/find_all_mains`, add/edit/delete character, and respawn timers.

## Data sources

- Character grouping: `characters.player_id` → `players`.
- `/priority` self-lookup: the invoker's Discord user ID → `players.discord_id`
  (seeded from Toryn's bot dump, so most members match without ever logging
  in; a new member is linked on first website login).
- EP/GP/priority: **`player_epgp_totals`** only — the materialized standings
  table seekers-tracker refreshes on every ledger write. Never aggregate
  `ep_ledger`/`gp_ledger` here; that's both a read-budget problem and a
  second copy of EPGP math that would drift.
- "Raided in the last N days" uses `max(characters.last_activity_at)` per
  account, NOT `player_epgp_totals.last_activity_at` — the latter counts
  decay rows, so everyone looks active right after a decay.
- Class IDs → names are copied in `src/format.ts` from seekers-tracker's
  `src/lib/eq/enums.ts`. Keep in sync.

## Gotchas

- Discord caps a message at 2000 chars: standings is limited to 25 rows of
  48 chars (class abbreviations keep a row from wrapping on phones).
  `reply()` hard-truncates as a last resort, which would break a code block.
- Each project's local Miniflare D1 state is directory-scoped; local runs
  must `--persist-to ../seekers-tracker/.wrangler/state` (the smoke script
  does) or they see an empty DB.
- Commands are **guild-scoped** (the register script requires
  `DISCORD_GUILD_ID`): guild commands only exist in that server, which is
  what keeps them out of DMs. Changes show up instantly; global commands
  wouldn't.
- Discord gives 3s to answer. Every command is 1-4 indexed queries on small
  tables, answered synchronously — no deferred responses needed. If a slow
  command is ever added, reply type 5 (deferred) + a follow-up via
  `ctx.waitUntil`.

## Status

- **2026-10-27**: rebuilt as the read-only v1 (`/lookup_characters`,
  `/whois`, `/priority`, `/standings`, name autocomplete, role gating).
  Verified with `npm run smoke` against local D1: signature (forged → 401),
  guild/role/denied-role/DM gating, autocomplete (incl. denied), lookups by
  main and alt, ambiguous/unknown/markdown/SQL-ish input, NoLooter hidden,
  priority by name/alt/self (linked + unlinked), whois, standings filters,
  25-row length check. **Not yet** run against real Discord: needs the new
  Discord application (the old bot's app isn't ours), secrets, a deploy to
  `bot.seekersofsouls.com`, and command registration — see README.
- **2026-10-28**: `/lookup_characters` merged into `/whois` (optional `name:`
  or `member:`, exactly one). Registration is a bulk PUT, so re-registering
  removes the old command from Discord.
- Out of scope for a Worker: anything needing passive channel reading
  (needs a persistent gateway connection). The old bot didn't do this
  either — its main/alt list was entered by officers via slash commands.
