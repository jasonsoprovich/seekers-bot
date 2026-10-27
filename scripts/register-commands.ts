// One-off script: registers ALL_COMMANDS to the Seekers of Souls server.
// Run after every change to src/commands.ts — Discord does not pick up
// command changes automatically. Guild-scoped on purpose: guild commands
// only exist inside that one server (never in DMs or other servers), and
// update instantly. A PUT replaces the full set, so a command removed from
// ALL_COMMANDS disappears from Discord too.
//
// Usage: DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... npm run register-commands
// (or put them in .dev.vars — this script reads it if present)

import { existsSync, readFileSync } from "node:fs";

import { ALL_COMMANDS } from "../src/commands";

if (existsSync(".dev.vars")) {
  for (const line of readFileSync(".dev.vars", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]] && match[2]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const applicationId = process.env.DISCORD_APPLICATION_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!applicationId || !botToken || !guildId) {
  console.error("Set DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN and DISCORD_GUILD_ID (env or .dev.vars). See README.md.");
  process.exit(1);
}

const response = await fetch(`https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${botToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(ALL_COMMANDS),
});

if (!response.ok) {
  console.error(`Registration failed: ${response.status} ${response.statusText}`);
  console.error(await response.text());
  process.exit(1);
}

const registered = (await response.json()) as Array<{ name: string; id: string }>;
console.log(`Registered ${registered.length} command(s) to the guild:`);
for (const cmd of registered) console.log(`  /${cmd.name}`);
