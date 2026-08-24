# seekers-bot

Discord slash-command bot for Seekers of Souls: a Cloudflare Worker
(Interactions Endpoint, not a gateway bot), sibling repo to
**seekers-tracker** (`../seekers-tracker` — the guild's Next.js/Cloudflare
website, which owns the D1 schema this repo reads from). Read that repo's
`CLAUDE.md` too for the full three-repo picture; this file is the bot's own
half. `README.md` in this repo has setup/deploy steps — this file is
roadmap/gotchas, not a setup guide.

## ⚠ Read `../PLAN.md` first

**`../PLAN.md` is the authoritative plan.** §8 has the design rationale for
this bot (why a Worker, the read-budget constraint, the passive-channel-
reading caveat). §11 Phase 9 is this repo's task list (tagged `[B]`).

**This repo never owns database schema or migrations** — `seekers-tracker`
does. `wrangler.jsonc`'s D1 binding deliberately has no `migrations_dir`.
Every query here must be a read.

## Stack

- Cloudflare Worker, plain `fetch` handler (no framework — Workers can't run
  Express/Node's HTTP server; `discord-interactions`' `verifyKey` function
  is used directly, not its Express-only `verifyKeyMiddleware`)
- `discord-interactions` for Ed25519 request-signature verification and
  interaction/response type constants
- D1 binding `DATABASE`, same database as `seekers-tracker`
- No auth of its own — Discord's signature verification *is* the auth

## Commands

```bash
npm run dev                 # wrangler dev, local D1 (empty until you --persist-to another project's state dir)
npm run deploy               # wrangler deploy
npm run register-commands    # push src/commands.ts to Discord (needs DISCORD_APPLICATION_ID/DISCORD_BOT_TOKEN — see README.md)
npm run typecheck            # tsc --noEmit
```

## Roadmap / status

**Phase 9 tasks 9.1-9.4 complete as of 2026-08-24** (repo scaffolded this
session). 9.5 (whether passive channel reading for main/alt registration
must be preserved — PLAN.md §8) is a leadership decision, not a code task,
and still open.

- `src/index.ts` — the fetch handler: verifies every request's
  `X-Signature-Ed25519`/`X-Signature-Timestamp` via `verifyKey` before
  touching the body, answers Discord's `PING` handshake, and routes
  `APPLICATION_COMMAND` interactions by `data.name`.
- `src/lookup.ts` — `/lookup_characters`'s query logic. Resolves a name to
  `characters.player_id` (100% backfilled since `seekers-tracker`'s Phase
  3), then lists every character sharing that player ordered
  `char_priority` (main 0, alt 1, mule 2) then name — same shape Toryn's
  old `SOS-Bot` produced by grouping on `discord_id`. An exact
  case-insensitive match short-circuits the `LIKE` search; multiple
  substring matches report the candidate names rather than guessing; an
  unlinked character (`player_id` NULL — PLAN.md §16, a known pre-Phase-10
  gap) reports itself alone instead of erroring.
- `src/commands.ts` — command definitions, imported by both the runtime
  handler and `scripts/register-commands.ts`, so they can't drift apart.
  **Add a new command here first**, then handle it in `index.ts`, then
  re-run `npm run register-commands` — Discord does not pick up command
  changes on its own.

**Verified this session** (not just `tsc`): generated a real Ed25519
keypair with Node's `crypto` module and drove `wrangler dev` directly over
HTTP — a correctly-signed `PING` returns `PONG`, a forged signature gets
401, and (pointing local `wrangler dev` at `seekers-tracker`'s own local D1
state via `--persist-to ../seekers-tracker/.wrangler/state`, since each
project's local Miniflare state is directory-scoped by default and isn't
shared automatically just because `wrangler.jsonc` names the same
`database_id`) `/lookup_characters Khrathak` correctly returns
Khrathak/Beguilez/Tyvalus/Valerion/Vault grouped together, main first — the
same real main-alt-pair group `seekers-tracker`'s own verify harness
fixture (Phase 3.12) already exercises. **Not verified against a real
Discord round trip** — this session has no Discord application credentials
(public key / bot token / application id) to register a live command or
receive a real interaction POST; `DISCORD_PUBLIC_KEY` in this repo's
`.dev.vars` is reset back to blank (see `.dev.vars.example`) after testing,
not left holding the throwaway test keypair.

**Not yet done**: no real deploy (no Cloudflare Worker created for this
name, no Interactions Endpoint URL registered in the Discord Developer
Portal). `worker-configuration.d.ts` is hand-written, not `wrangler
types`-generated, for the same reason — regenerate via `npm run cf-typegen`
once this Worker actually exists and delete that file's disclaimer comment.

**Explicitly out of scope for this repo**: anything requiring passive
channel reading (harvesting main/alt registrations from message history,
which Toryn's old bot did) — Workers can't hold a gateway WebSocket open.
If leadership decides that must be preserved (§9.5), it needs a separate,
persistently-hosted service; don't try to bolt it onto this Worker.
