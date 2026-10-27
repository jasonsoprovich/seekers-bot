import { InteractionResponseFlags, InteractionResponseType, InteractionType, verifyKey } from "discord-interactions";

import { checkAccess } from "./access";
import { STANDINGS_WINDOWS } from "./commands";
import { readOnly, type ReadOnlyDb } from "./db";
import { characterTable, classIdFromName, className, clean, SITE_URL, standingsTable, totalsBlock } from "./format";
import {
  autocompleteCharacterNames,
  findCharacter,
  findPlayerByDiscordId,
  getPlayerCharacters,
  getPlayerInfo,
  getSingleCharacter,
  getStandings,
  getTotals,
} from "./queries";

// Discord Interactions Endpoint (PLAN.md §8/§11 Phase 9). Runs as a plain
// fetch handler rather than a gateway bot on purpose — Workers can't hold a
// persistent WebSocket, so this only ever responds to a POST Discord makes
// to this Worker's URL, never listens passively.
//
// Strictly informational: every command is a read (db.ts refuses anything
// else) and every reply is ephemeral (only the person who ran it sees it).
// Character/account changes happen on the website only.

type Option = { name: string; type: number; value?: string | number | boolean; focused?: boolean };
type Interaction = {
  type: number;
  guild_id?: string;
  member?: { roles?: string[]; user?: { id: string } };
  data?: { name: string; options?: Option[] };
};

const RANK_WINDOW_DAYS = 30;

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Seekers of Souls Discord bot. This endpoint only accepts Discord interactions.", { status: 405 });
    }

    const signature = request.headers.get("X-Signature-Ed25519");
    const timestamp = request.headers.get("X-Signature-Timestamp");
    const body = await request.text();

    if (!signature || !timestamp) {
      return new Response("Missing signature headers.", { status: 401 });
    }

    const isValid = await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);
    if (!isValid) {
      return new Response("Bad request signature.", { status: 401 });
    }

    const interaction = JSON.parse(body) as Interaction;

    if (interaction.type === InteractionType.PING) {
      return json({ type: InteractionResponseType.PONG });
    }

    const db = readOnly(env.DATABASE);

    if (interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
      // Same gate as the commands themselves — no roster names for anyone
      // who couldn't run the command.
      const choices = checkAccess(interaction, env).ok ? await autocomplete(interaction, db) : [];
      return json({
        type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
        data: { choices: choices.map((name) => ({ name, value: name })) },
      });
    }

    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const access = checkAccess(interaction, env);
      if (!access.ok) return reply(access.reason);

      try {
        switch (interaction.data?.name) {
          case "lookup_characters":
            return reply(await lookupCharacters(db, stringOption(interaction, "name")));
          case "whois":
            return reply(await whois(db, stringOption(interaction, "member")));
          case "priority":
            return reply(await priority(db, interaction));
          case "standings":
            return reply(await standings(db, interaction));
          default:
            return reply("That command isn't available any more.");
        }
      } catch (err) {
        console.error(`[command] /${interaction.data?.name} failed: ${err}`);
        return reply("Something went wrong looking that up. Please try again in a moment.");
      }
    }

    return new Response("Unhandled interaction type.", { status: 400 });
  },
} satisfies ExportedHandler<CloudflareEnv>;

async function autocomplete(interaction: Interaction, db: ReadOnlyDb): Promise<string[]> {
  const focused = interaction.data?.options?.find((o) => o.focused);
  if (!focused || focused.name !== "name") return [];
  try {
    return await autocompleteCharacterNames(db, String(focused.value ?? ""));
  } catch (err) {
    console.error(`[autocomplete] failed: ${err}`);
    return [];
  }
}

async function lookupCharacters(db: ReadOnlyDb, query: string): Promise<string> {
  const found = await findCharacter(db, query);
  if (found.kind === "not_found") return `No active character found matching **${clean(query)}**.`;
  if (found.kind === "ambiguous") return ambiguous(query, found.matches);

  if (found.playerId == null) {
    const single = await getSingleCharacter(db, found.name);
    return `**${found.name}** isn't linked to a member account yet.\n${single ? characterTable([single]) : ""}`;
  }
  return accountListing(db, found.playerId);
}

async function whois(db: ReadOnlyDb, discordId: string): Promise<string> {
  if (!/^\d+$/.test(discordId)) return "Pick a member from the list.";
  const player = await findPlayerByDiscordId(db, discordId);
  if (!player) return `<@${discordId}> isn't connected to a member account on the website.`;
  if (player.status !== "active") return `<@${discordId}> has no active characters.`;
  return accountListing(db, player.id);
}

async function accountListing(db: ReadOnlyDb, playerId: number): Promise<string> {
  const [info, chars] = await Promise.all([getPlayerInfo(db, playerId), getPlayerCharacters(db, playerId)]);
  if (chars.length === 0) return "That account has no active characters.";
  const title = info?.mainName ?? chars[0].name;
  return `Characters for **${title}**${mention(info?.discordId)}\n${characterTable(chars)}`;
}

async function priority(db: ReadOnlyDb, interaction: Interaction): Promise<string> {
  const query = stringOption(interaction, "name");
  let playerId: number;
  let lookedUpAs: string | null = null;

  if (!query) {
    const discordId = interaction.member?.user?.id;
    const player = discordId ? await findPlayerByDiscordId(db, discordId) : null;
    if (!player) {
      return `Your Discord has not been connected to the website yet. Please log in at ${SITE_URL} and it will be linked automatically.`;
    }
    if (player.status !== "active") {
      return "Your account isn't active on the website. Please talk to an officer if that's a mistake.";
    }
    playerId = player.id;
  } else {
    const found = await findCharacter(db, query);
    if (found.kind === "not_found") return `No active character found matching **${clean(query)}**.`;
    if (found.kind === "ambiguous") return ambiguous(query, found.matches);
    if (found.playerId == null) return `**${found.name}** isn't linked to a member account, so it has no EPGP of its own.`;
    playerId = found.playerId;
    lookedUpAs = found.name;
  }

  const [info, totals, ranked] = await Promise.all([
    getPlayerInfo(db, playerId),
    getTotals(db, playerId),
    getStandings(db, { activeWithinDays: RANK_WINDOW_DAYS }),
  ]);
  const main = info?.mainName ?? lookedUpAs ?? "This account";
  const classLabel = info?.classId != null ? ` (${className(info.classId)})` : "";
  const via = lookedUpAs && info?.mainName && lookedUpAs.toLowerCase() !== info.mainName.toLowerCase()
    ? `\n_${lookedUpAs} is an alt — EP/GP are tracked on the main's account._`
    : "";

  if (!totals) return `**${main}**${classLabel} has no EPGP history yet.${via}`;

  const position = ranked.findIndex((r) => r.playerId === playerId);
  const rank =
    position >= 0
      ? `Rank **#${position + 1}** of ${ranked.length} members who raided in the last ${RANK_WINDOW_DAYS} days.`
      : `Not ranked — no raid activity in the last ${RANK_WINDOW_DAYS} days.`;

  return `**${main}**${classLabel}\n${totalsBlock(totals)}\n${rank}${via}`;
}

async function standings(db: ReadOnlyDb, interaction: Interaction): Promise<string> {
  const classOpt = stringOption(interaction, "class");
  const windowOpt = stringOption(interaction, "active") || "30";
  const limitOpt = interaction.data?.options?.find((o) => o.name === "limit")?.value;
  const limit = Math.min(25, Math.max(1, typeof limitOpt === "number" ? limitOpt : 20));

  const classId = classOpt ? classIdFromName(classOpt) : undefined;
  const days = windowOpt === "all" ? undefined : Number(windowOpt) || 30;
  const rows = await getStandings(db, { classId, activeWithinDays: days });

  const who = classOpt ? `${clean(classOpt)}s` : "All classes";
  const windowLabel = STANDINGS_WINDOWS.find((w) => w.value === windowOpt)?.name.toLowerCase() ?? "raided in the last 30 days";
  if (rows.length === 0) return `No standings for **${who}** (${windowLabel}).`;

  const shown = rows.slice(0, limit);
  const count = rows.length > shown.length ? `top ${shown.length} of ${rows.length}` : `${rows.length}`;
  return `Loot priority — **${who}**, ${windowLabel} (${count})\n${standingsTable(shown)}\nFull standings: ${SITE_URL}/roster`;
}

function ambiguous(query: string, matches: string[]): string {
  return `Several characters match **${clean(query)}**: ${matches.join(", ")}. Pick one from the suggestions or type the full name.`;
}

function mention(discordId: string | null | undefined): string {
  return discordId && /^\d+$/.test(discordId) ? ` (<@${discordId}>)` : "";
}

function stringOption(interaction: Interaction, name: string): string {
  const value = interaction.data?.options?.find((o) => o.name === name)?.value;
  return typeof value === "string" ? value : "";
}

// Every reply is ephemeral (only the invoker sees it) and pings nobody —
// allowed_mentions with an empty parse list renders <@id> as a name without
// notifying that member.
function reply(content: string): Response {
  return json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: content.slice(0, 2000),
      flags: InteractionResponseFlags.EPHEMERAL,
      allowed_mentions: { parse: [] },
    },
  });
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}
