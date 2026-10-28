# seekers-bot

Read-only Discord slash-command bot for Seekers of Souls — a Cloudflare
Worker answering Discord's Interactions Endpoint, not a gateway bot. It reads
the same D1 database as the website (`../seekers-tracker`, which owns the
schema) and never writes to it. All character/account changes happen on the
website.

## Commands

All replies are private (ephemeral — only the person who ran the command sees
them) and ping nobody.

| Command | What it shows |
|---|---|
| `/whois name:` or `/whois member:@user` | Every active character on that member's account (main first, then alts, then mules), from any one character name (autocompletes) or from a Discord member. Give one or the other. |
| `/priority [name:]` | EP, GP, loot priority and rank. Empty = your own account (matched by your Discord ID); otherwise any character name (an alt resolves to its account). |
| `/standings [class:] [active:] [limit:]` | Priority standings, one row per account under its main. Defaults: all classes, raided in the last 30 days, top 20 (max 25). |

EP/GP/priority come from `player_epgp_totals` — the website's own standings
table — so the bot always shows the same numbers as `/roster`.

## Who can use it

Same rule as the website: the command must come from the Seekers of Souls
server (commands are registered to that server only, and the Worker re-checks
the server ID on every request), the member must have the **Seeker** role, and
must not have **Orc Pawn** or **Guest**. Only *active* characters on *active*
accounts are ever shown.

## Safety

- Every request's Ed25519 signature is verified against the app's public key
  before anything else runs — that's what proves a request came from Discord.
- `src/db.ts` wraps the D1 binding and refuses any statement that isn't a
  plain `SELECT`. All user input reaches D1 only as bound parameters.
- The bot token is used only by `npm run register-commands` on your machine.
  The deployed Worker holds just the public key and the guild/role IDs.
- A separate Worker from the website, so a bot problem can't take the site down.
- Queries only touch `characters`, `players` and `player_epgp_totals` (a few
  hundred rows) — never the ledgers.

## First-time setup

1. **Create the app** at https://discord.com/developers/applications → New
   Application (e.g. "Seekers Bot").
   - **General Information**: copy the **Application ID** and **Public Key**.
   - **Bot** tab: Reset Token → copy the **token** (treat it like a password).
     Leave every Privileged Gateway Intent **off** — the bot never reads
     messages or member lists.
   - **Installation** tab: Installation Contexts → **Guild Install** only
     (untick User Install). Default install link scopes: `applications.commands`
     only — no `bot` scope or permissions are needed.

2. **Get the IDs** (Discord → User Settings → Advanced → Developer Mode on):
   right-click the server icon → Copy Server ID; Server Settings → Roles →
   right-click **Seeker** / **Orc Pawn** / **Guest** → Copy Role ID.

3. **Local config**: `cp .dev.vars.example .dev.vars` and fill everything in.

4. **Secrets for the deployed Worker** (from this folder):
   ```
   npx wrangler secret put DISCORD_PUBLIC_KEY
   npx wrangler secret put DISCORD_GUILD_ID
   npx wrangler secret put SEEKER_ROLE_ID
   npx wrangler secret put DENIED_ROLE_IDS     # "orcpawnid,guestid"
   ```
   (The first `secret put` creates the Worker if it doesn't exist yet.)

5. **Deploy**: `npm run deploy`. This also sets up
   `https://bot.seekersofsouls.com` (DNS + certificate) automatically.

6. **Point Discord at it**: Developer Portal → General Information →
   **Interactions Endpoint URL** = `https://bot.seekersofsouls.com` → Save.
   Discord sends a test PING right away; saving only succeeds if the Worker
   answers correctly.

7. **Invite it**: Installation tab → copy the install link → open it → pick
   the Seekers of Souls server (needs a server admin / Manage Server).

8. **Register the commands**: `npm run register-commands` (reads `.dev.vars`).
   Re-run any time `src/commands.ts` changes.

To retire the old SOS-Bot, a server admin removes it under Server Settings →
Integrations.

## Development

```bash
npm run typecheck          # tsc --noEmit
npm run smoke              # local end-to-end: wrangler dev + signed fake interactions against ../seekers-tracker's local D1
npm run dev                # wrangler dev (add --persist-to ../seekers-tracker/.wrangler/state for real local data)
npm run deploy             # wrangler deploy
npm run register-commands  # push src/commands.ts to the guild
npx wrangler tail seekers-bot --format pretty   # live logs
```

## Adding a command

1. Add its definition to `ALL_COMMANDS` in `src/commands.ts`.
2. Handle it in `src/index.ts`; put any SQL in `src/queries.ts` (reads only —
   `db.ts` will refuse anything else).
3. Add a case to `scripts/smoke.ts`, run `npm run smoke`.
4. Deploy, then `npm run register-commands`.
